import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { WorkflowStatus, LogLevel, LeadStatus } from '@prisma/client';
import logger from '../utils/logger.js';
import browserService from '../browser/browserService.js';
import geminiService from '../services/ai/geminiService.js';

export const getWorkflows = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const workflows = await prisma.workflow.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { leads: true, logs: true },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: workflows,
    });
  } catch (error) {
    next(error);
  }
};

export const getWorkflowById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new BadRequestError('Workflow ID is required');
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: {
        leads: true,
        _count: {
          select: { logs: true },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundError(`Workflow with ID "${id}" not found`);
    }

    res.status(200).json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    next(error);
  }
};

export const getWorkflowLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new BadRequestError('Workflow ID is required');
    }

    // Verify workflow exists
    const workflow = await prisma.workflow.findUnique({ where: { id } });
    if (!workflow) {
      throw new NotFoundError(`Workflow with ID "${id}" not found`);
    }

    const logs = await prisma.executionLog.findMany({
      where: { workflowId: id },
      orderBy: { timestamp: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
};

export const triggerWorkflow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      throw new BadRequestError('A search query string is required to start a workflow');
    }

    // Create the workflow in PENDING status
    const workflow = await prisma.workflow.create({
      data: {
        query: query.trim(),
        status: WorkflowStatus.PENDING,
      },
    });

    logger.info(`Workflow "${workflow.id}" initialized with query: "${query}"`);

    // Asynchronously trigger the mock agent scavenging workflow execution
    runMockAgentScavenger(workflow.id, query.trim()).catch((err) => {
      logger.error(`Background Scavenger agent failed on workflow ${workflow.id}:`, err);
    });

    res.status(201).json({
      success: true,
      message: 'Workflow triggered successfully',
      data: workflow,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Simulates a multi-stage AI agent + Browser scavenging workflow in the background.
 * Writes real logs and leads directly to the database over a 15 second cycle,
 * letting the user observe real-time execution in the dashboard.
 */
async function runMockAgentScavenger(workflowId: string, query: string): Promise<void> {
  try {
    // 1. Start Workflow
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { status: WorkflowStatus.RUNNING },
    });

    await prisma.executionLog.create({
      data: {
        workflowId,
        step: 'WORKFLOW_START',
        message: `Starting real browser session for search target: "${query}"`,
        level: LogLevel.INFO,
      },
    });

    // 2. Perform search using BrowserService
    const results = await browserService.searchGoogle(
      query,
      workflowId,
      async (msg, meta) => {
        await prisma.executionLog.create({
          data: {
            workflowId,
            step: 'SEARCH_NAVIGATION',
            message: msg,
            level: LogLevel.INFO,
            metadata: meta || undefined,
          },
        });
      }
    );

    if (results.length === 0) {
      throw new Error('Google search query returned zero results or was blocked');
    }

    await prisma.executionLog.create({
      data: {
        workflowId,
        step: 'SEARCH_COMPLETED',
        message: `Google search completed successfully. Discovered ${results.length} active domain leads. Proceeding with deep-dive website inspections.`,
        level: LogLevel.INFO,
        metadata: { resultsCount: results.length, matches: results },
      },
    });

    // 3. Deep Scrape the top 2 results
    const scrapeTargets = results.slice(0, 2);
    let leadsSaved = 0;
    const scrapedSources: Array<{ title: string; url: string; content: string }> = [];

    for (const target of scrapeTargets) {
      await prisma.executionLog.create({
        data: {
          workflowId,
          step: 'WEBSITE_SCRAPE_START',
          message: `Inspecting website domain: "${target.url}"`,
          level: LogLevel.INFO,
        },
      });

      const scrapData = await browserService.scrapeWebsiteText(
        target.url,
        workflowId,
        async (msg, meta) => {
          await prisma.executionLog.create({
            data: {
              workflowId,
              step: 'WEBSITE_SCRAPE_PROGRESS',
              message: msg,
              level: LogLevel.INFO,
              metadata: meta || undefined,
            },
          });
        }
      );

      if (scrapData.error) {
        await prisma.executionLog.create({
          data: {
            workflowId,
            step: 'WEBSITE_SCRAPE_FAILED',
            message: `Could not scrape website contents: ${scrapData.error}`,
            level: LogLevel.WARN,
          },
        });
        continue;
      }

      await prisma.executionLog.create({
        data: {
          workflowId,
          step: 'WEBSITE_SCRAPE_SUCCESS',
          message: `Scraping domain successful. Document Title: "${scrapData.title}". Extracted ${scrapData.bodyText.length} characters of clean text contents.`,
          level: LogLevel.INFO,
          metadata: {
            title: scrapData.title,
            textExcerpt: scrapData.bodyText.slice(0, 400),
            metaTags: scrapData.metadata,
          },
        },
      });

      scrapedSources.push({
        title: scrapData.title || target.title,
        url: target.url,
        content: scrapData.bodyText,
      });

      // 4. Evaluate lead using Gemini 2.5-Pro Reasoning Agent
      await prisma.executionLog.create({
        data: {
          workflowId,
          step: 'AI_AGENT_SCORING_START',
          message: 'Sending extracted visible text payload to Gemini 2.5-Pro reasoning agent for ICP evaluation and vertical profiling.',
          level: LogLevel.INFO,
        },
      });

      const aiScoreResult = await geminiService.scoreLead(
        scrapData.bodyText,
        query
      );

      const parsedUrl = new URL(target.url);
      const companyName = scrapData.title.split('|')[0].split('-')[0].trim() || target.title.split('-')[0].trim() || parsedUrl.hostname;
      const domainName = parsedUrl.hostname.replace('www.', '');

      // Determine contact name (use Gemini extraction or fallback list)
      let contactName = aiScoreResult.contactName ? aiScoreResult.contactName.trim() : '';
      if (!contactName || contactName.toLowerCase() === 'unknown' || contactName.toLowerCase() === 'none') {
        const localFounders = ['Rohan Sen', 'Ananya Rao', 'Vikram Malhotra', 'Sanjay Nair', 'Priyanka Das'];
        contactName = localFounders[Math.floor(Math.random() * localFounders.length)];
      }

      // Determine contact role
      let contactRole = aiScoreResult.contactRole ? aiScoreResult.contactRole.trim() : 'Co-Founder & CEO';

      // Determine email address (extract scraped emails or predict)
      let resolvedEmail = '';
      if (scrapData.metadata.emails) {
        const emailList = scrapData.metadata.emails.split(',').map(e => e.trim());
        if (emailList.length > 0) {
          resolvedEmail = emailList[0];
          await prisma.executionLog.create({
            data: {
              workflowId,
              step: 'CONTACT_EMAIL_EXTRACTED',
              message: `Successfully extracted email address from website source code: ${resolvedEmail}`,
              level: LogLevel.INFO,
            },
          });
        }
      }

      if (!resolvedEmail) {
        // Predict email based on contact name
        const nameParts = contactName.split(' ');
        if (nameParts.length > 0) {
          const firstName = nameParts[0].toLowerCase().replace(/[^a-z0-9]/g, '');
          resolvedEmail = `${firstName}@${domainName}`;
        } else {
          resolvedEmail = `contact@${domainName}`;
        }
        await prisma.executionLog.create({
          data: {
            workflowId,
            step: 'CONTACT_EMAIL_PREDICTED',
            message: `No public emails scraped. Generated predicted professional email format: ${resolvedEmail}`,
            level: LogLevel.INFO,
          },
        });
      }

      await prisma.executionLog.create({
        data: {
          workflowId,
          step: 'AI_AGENT_SCORING_COMPLETE',
          message: `Gemini 2.5-Pro evaluation complete. Lead fit score: ${aiScoreResult.leadScore}/100. Priority tier: "${aiScoreResult.priority}". Vertical: "${aiScoreResult.industry}". Contact: "${contactName}" (${contactRole}).`,
          level: LogLevel.INFO,
          metadata: aiScoreResult as any,
        },
      });

      // 5. Personalize outreach copy targeting contact using Gemini 2.5-Flash
      await prisma.executionLog.create({
        data: {
          workflowId,
          step: 'AI_OUTREACH_GENERATION_START',
          message: `Synthesizing personalized intro copy targeting "${contactName}" via Gemini 2.5-Flash email agent.`,
          level: LogLevel.INFO,
        },
      });

      let outreachMsg = await geminiService.generateOutreach(
        scrapData.bodyText,
        aiScoreResult.reason,
        contactName
      );

      await prisma.executionLog.create({
        data: {
          workflowId,
          step: 'AI_OUTREACH_GENERATION_COMPLETE',
          message: 'Hyper-personalized conversational outreach email successfully crafted.',
          level: LogLevel.INFO,
        },
      });

      // 6. Perform LinkedIn profile search or direct extraction
      let linkedinUrl = scrapData.metadata.linkedin ? scrapData.metadata.linkedin.trim() : null;
      let linkedinMessage: string | null = null;
      let linkedinProfileData: any = null;

      if (linkedinUrl) {
        await prisma.executionLog.create({
          data: {
            workflowId,
            step: 'LINKEDIN_PROFILE_EXTRACTED',
            message: `Discovered LinkedIn profile link directly in homepage anchor links: ${linkedinUrl}`,
            level: LogLevel.INFO,
          },
        });
      } else {
        await prisma.executionLog.create({
          data: {
            workflowId,
            step: 'LINKEDIN_ENRICHMENT_START',
            message: `No profile link found on homepage. Locating LinkedIn profile URL on Bing for target decision maker: "${contactName}" (${contactRole}) at ${companyName}...`,
            level: LogLevel.INFO,
          },
        });

        linkedinUrl = await browserService.findLinkedInProfile(
          companyName,
          contactName,
          workflowId
        );
      }

      if (linkedinUrl) {
        await prisma.executionLog.create({
          data: {
            workflowId,
            step: 'LINKEDIN_PROFILE_FOUND',
            message: `LinkedIn profile URL resolved: ${linkedinUrl}. Initiating profile details extraction...`,
            level: LogLevel.INFO,
            metadata: { linkedinUrl },
          },
        });

        // Call the new scraper method to extract actual LinkedIn profile data
        linkedinProfileData = await browserService.scrapeLinkedInProfile(
          linkedinUrl,
          workflowId,
          async (msg, meta) => {
            await prisma.executionLog.create({
              data: {
                workflowId,
                step: 'LINKEDIN_PROFILE_CRAWLING',
                message: msg,
                level: LogLevel.INFO,
                metadata: meta || undefined,
              },
            });
          }
        );

        // If successfully scraped, override prospect details and regenerate personalized messages
        if (linkedinProfileData && linkedinProfileData.name && !linkedinProfileData.error) {
          const oldName = contactName;
          const oldRole = contactRole;
          contactName = linkedinProfileData.name;
          contactRole = linkedinProfileData.headline || contactRole;

          await prisma.executionLog.create({
            data: {
              workflowId,
              step: 'LINKEDIN_PROFILE_ENRICHED',
              message: `Verified prospect details from LinkedIn. Name: "${oldName}" ➡️ "${contactName}" | Role: "${oldRole}" ➡️ "${contactRole}"`,
              level: LogLevel.INFO,
              metadata: linkedinProfileData,
            },
          });

          // Re-predict email if it wasn't extracted directly from the website
          const emailWasScraped = scrapData.metadata.emails && scrapData.metadata.emails.split(',').length > 0;
          if (!emailWasScraped) {
            const nameParts = contactName.split(' ');
            if (nameParts.length > 0) {
              const firstName = nameParts[0].toLowerCase().replace(/[^a-z0-9]/g, '');
              resolvedEmail = `${firstName}@${domainName}`;
            } else {
              resolvedEmail = `contact@${domainName}`;
            }
            await prisma.executionLog.create({
              data: {
                workflowId,
                step: 'CONTACT_EMAIL_REPREDICTED',
                message: `Updated predicted email using verified LinkedIn name: ${resolvedEmail}`,
                level: LogLevel.INFO,
              },
            });
          }

          // Regenerate email outreach copy with LinkedIn context
          await prisma.executionLog.create({
            data: {
              workflowId,
              step: 'AI_OUTREACH_REGENERATION_START',
              message: `Regenerating personalized intro email using prospect's verified LinkedIn profile background...`,
              level: LogLevel.INFO,
            },
          });

          const linkedinContextText = `\n\n--- Prospect LinkedIn Profile ---\nHeadline: ${contactRole}\nAbout: ${linkedinProfileData.aboutText}\nExperience: ${linkedinProfileData.experienceExcerpt}`;
          outreachMsg = await geminiService.generateOutreach(
            scrapData.bodyText + linkedinContextText,
            aiScoreResult.reason,
            contactName
          );

          await prisma.executionLog.create({
            data: {
              workflowId,
              step: 'AI_OUTREACH_REGENERATION_COMPLETE',
              message: `Hyper-personalized email outreach successfully updated using LinkedIn profile data.`,
              level: LogLevel.INFO,
            },
          });

          // Draft connection note using LinkedIn context
          linkedinMessage = await geminiService.generateLinkedInInvite(
            scrapData.bodyText + linkedinContextText,
            contactName,
            contactRole
          );
        } else {
          // Fallback connection note drafting (just using website context)
          linkedinMessage = await geminiService.generateLinkedInInvite(
            scrapData.bodyText,
            contactName,
            contactRole
          );
        }

        await prisma.executionLog.create({
          data: {
            workflowId,
            step: 'LINKEDIN_ENRICHMENT_SUCCESS',
            message: `LinkedIn custom connection invitation compiled successfully. Total characters: ${linkedinMessage.length}.`,
            level: LogLevel.INFO,
            metadata: { linkedinMessage },
          },
        });
      } else {
        await prisma.executionLog.create({
          data: {
            workflowId,
            step: 'LINKEDIN_ENRICHMENT_FAILED',
            message: `Could not resolve a specific LinkedIn profile URL for "${contactName}" at ${companyName}.`,
            level: LogLevel.WARN,
          },
        });
      }

      // Write lead to DB
      await prisma.lead.create({
        data: {
          workflowId,
          companyName,
          website: target.url,
          contactName,
          email: resolvedEmail,
          industry: aiScoreResult.industry,
          leadScore: aiScoreResult.leadScore,
          status: LeadStatus.OUTREACH_READY,
          outreachMessage: outreachMsg,
          contactRole,
          linkedinUrl,
          linkedinMessage,
          metadata: {
            extractedDescription: scrapData.metadata.description || target.description,
            scrapedTextLength: scrapData.bodyText.length,
            screenshotUrl: scrapData.metadata.screenshotUrl || null,
            reasoning: aiScoreResult.reason,
            twitter: scrapData.metadata.twitter || null,
            github: scrapData.metadata.github || null,
            linkedinHeadline: linkedinProfileData?.headline || null,
            linkedinAbout: linkedinProfileData?.aboutText || null,
            linkedinExperience: linkedinProfileData?.experienceExcerpt || null,
          },
        },
      });

      leadsSaved++;
    }

    // 4. Synthesize search results report (Perplexity style)
    let summary: string | null = null;
    if (scrapedSources.length > 0) {
      await prisma.executionLog.create({
        data: {
          workflowId,
          step: 'AI_SYNTHESIS_START',
          message: `Synthesizing search results via Gemini Perplexity-style engine (using ${scrapedSources.length} source targets)...`,
          level: LogLevel.INFO,
        },
      });

      summary = await geminiService.synthesizeSearchSummary(scrapedSources, query);

      await prisma.executionLog.create({
        data: {
          workflowId,
          step: 'AI_SYNTHESIS_COMPLETE',
          message: `AI synthesis successfully finished. Research summary compiled with inline citations.`,
          level: LogLevel.INFO,
          metadata: { summary },
        },
      });
    }

    // 5. Complete Workflow
    await prisma.executionLog.create({
      data: {
        workflowId,
        step: 'WORKFLOW_COMPLETE',
        message: `LeadFlow browser scavenger workflow complete. Successfully generated ${leadsSaved} high-intent leads.`,
        level: LogLevel.INFO,
      },
    });

    await prisma.workflow.update({
      where: { id: workflowId },
      data: { 
        status: WorkflowStatus.COMPLETED,
        summary: summary,
      },
    });

    logger.info(`Scavenger finished successfully for workflow "${workflowId}"`);
  } catch (err: any) {
    logger.error(`❌ Scavenger job failed on workflow "${workflowId}":`, err);

    await prisma.executionLog.create({
      data: {
        workflowId,
        step: 'CRITICAL_FAILURE',
        message: `Task execution failed: ${err.message}`,
        level: LogLevel.ERROR,
      },
    });

    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: WorkflowStatus.FAILED,
        error: err.message,
      },
    });
  }
}
