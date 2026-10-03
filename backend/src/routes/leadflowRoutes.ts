import { Router, Request, Response } from 'express';
import { DiscoveryService, RawCompanyInput } from '../services/discoveryService.js';
import { IcpService } from '../services/icpService.js';
import { QualificationService } from '../services/qualificationService.js';
import { EnrichmentService } from '../services/enrichmentService.js';
import { SignalEngine } from '../services/signalEngine.js';
import { ScoringService } from '../services/scoringService.js';
import { ResearchAgentService } from '../services/ai/researchAgentService.js';
import { PersonalizationService } from '../services/personalizationService.js';
import { ReviewService } from '../services/reviewService.js';
import { ResponseAnalysisService } from '../services/responseAnalysisService.js';
import { LeadMemoryService } from '../services/leadMemoryService.js';
import { AnalyticsService } from '../services/analyticsService.js';
import { QueueService } from '../services/queueService.js';
import { emailService } from '../services/emailService.js';
import { hasUsableGeminiKey } from '../services/ai/llmClient.js';
import { prisma } from '../db/prisma.js';
import logger from '../utils/logger.js';

const router = Router();

// ============================================================================
// 1. LEAD DISCOVERY & IMPORT
// ============================================================================

router.post('/import/csv', async (req: Request, res: Response) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({ success: false, error: 'csvContent string required' });
    }

    const items = DiscoveryService.parseCsv(csvContent);
    const result = await DiscoveryService.ingestCompanies(items, 'CSV_UPLOAD');

    // Optionally enqueue pipeline for each newly created lead
    if (req.body.autoProcess && result.createdLeadIds.length > 0) {
      for (let i = 0; i < result.createdLeadIds.length; i++) {
        const leadId = result.createdLeadIds[i];
        const companyId = result.createdCompanyIds[i];
        await QueueService.enqueueJob({
          jobType: 'PROCESS_LEAD_PIPELINE',
          payload: { leadId, companyId },
        });
      }
    }

    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Error importing CSV:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/import/json', async (req: Request, res: Response) => {
  try {
    const { companies, autoProcess } = req.body;
    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ success: false, error: 'Array of company objects required' });
    }

    const result = await DiscoveryService.ingestCompanies(companies, 'API_IMPORT');

    if (autoProcess && result.createdLeadIds.length > 0) {
      for (let i = 0; i < result.createdLeadIds.length; i++) {
        await QueueService.enqueueJob({
          jobType: 'PROCESS_LEAD_PIPELINE',
          payload: { leadId: result.createdLeadIds[i], companyId: result.createdCompanyIds[i] },
        });
      }
    }

    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Error importing JSON:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 2. ICP PROFILES
// ============================================================================

router.get('/icp', async (_req: Request, res: Response) => {
  try {
    const active = await IcpService.getActiveIcp();
    const all = await IcpService.listIcps();
    res.json({ success: true, data: { active, all } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/icp', async (req: Request, res: Response) => {
  try {
    const icp = await IcpService.createIcp(req.body);
    res.status(201).json({ success: true, data: icp });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/icp/:id', async (req: Request, res: Response) => {
  try {
    const updated = await IcpService.updateIcp(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 3. LEADS & PIPELINE EXECUTION
// ============================================================================

router.get('/leads', async (req: Request, res: Response) => {
  try {
    const { status, search, minScore } = req.query;

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (minScore) {
      where.leadScore = { gte: Number(minScore) };
    }
    if (search) {
      where.OR = [
        { fullName: { contains: String(search), mode: 'insensitive' } },
        { companyName: { contains: String(search), mode: 'insensitive' } },
        { role: { contains: String(search), mode: 'insensitive' } },
        { industry: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            domain: true,
            employeeCount: true,
            country: true,
            fundingStage: true,
            technologies: true,
            signals: { take: 3, orderBy: { detectedAt: 'desc' } },
          },
        },
        scores: { take: 1, orderBy: { scoredAt: 'desc' } },
        outreachMessages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ leadScore: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({ success: true, count: leads.length, data: leads });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/leads/:id/360', async (req: Request, res: Response) => {
  try {
    const data = await AnalyticsService.getSalespersonLead360(req.params.id);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(404).json({ success: false, error: error.message });
  }
});

router.post('/leads/:id/qualify', async (req: Request, res: Response) => {
  try {
    const result = await QualificationService.evaluateLead(req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/leads/:id/enrich', async (req: Request, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead || !lead.companyId) return res.status(404).json({ success: false, error: 'Lead company not found' });

    const enrichment = await EnrichmentService.enrichCompany(lead.companyId);
    const signals = await SignalEngine.detectSignals(lead.companyId);

    res.json({ success: true, data: { enrichment, signals } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/leads/:id/score', async (req: Request, res: Response) => {
  try {
    const score = await ScoringService.scoreLead(req.params.id);
    res.json({ success: true, data: score });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/leads/:id/research', async (req: Request, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead || !lead.companyId) return res.status(404).json({ success: false, error: 'Lead company not found' });

    const dossier = await ResearchAgentService.runResearch(lead.companyId);
    res.json({ success: true, data: dossier });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/leads/:id/outreach', async (req: Request, res: Response) => {
  try {
    const draft = await PersonalizationService.generateOutreach(req.params.id);
    res.json({ success: true, data: draft });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trigger full pipeline asynchronously
router.post('/leads/:id/pipeline', async (req: Request, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead || !lead.companyId) return res.status(404).json({ success: false, error: 'Lead company not found' });

    const job = await QueueService.enqueueJob({
      jobType: 'PROCESS_LEAD_PIPELINE',
      payload: { leadId: lead.id, companyId: lead.companyId },
    });

    res.json({
      success: true,
      message: 'Lead intelligence pipeline queued for execution',
      data: { jobId: job.id, status: job.status },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 4. HUMAN REVIEW WORKFLOW
// ============================================================================

router.get('/outreach/pending', async (_req: Request, res: Response) => {
  try {
    const pending = await prisma.outreachMessage.findMany({
      where: { state: { in: ['DRAFT', 'REVIEW'] } },
      include: {
        lead: {
          include: {
            company: {
              include: { signals: { take: 3 } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, count: pending.length, data: pending });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/outreach/:id/approve', async (req: Request, res: Response) => {
  try {
    const { reviewerNotes, editedSubject, editedBody } = req.body;
    const approved = await ReviewService.approveMessage(
      req.params.id,
      undefined,
      reviewerNotes,
      editedSubject,
      editedBody
    );
    res.json({ success: true, message: 'Outreach approved by SDR', data: approved });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/outreach/:id/reject', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const rejected = await ReviewService.rejectMessage(req.params.id, reason || 'Rejected by SDR');
    res.json({ success: true, data: rejected });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/outreach/:id/dispatch', async (req: Request, res: Response) => {
  try {
    const sent = await ReviewService.dispatchMessage(req.params.id);
    res.json({ success: true, message: 'Message successfully dispatched', data: sent });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 5. INBOUND RESPONSE SIMULATION & FEEDBACK
// ============================================================================

router.post('/leads/:id/response', async (req: Request, res: Response) => {
  try {
    const { rawContent, messageId } = req.body;
    if (!rawContent) {
      return res.status(400).json({ success: false, error: 'rawContent reply text required' });
    }

    const result = await ResponseAnalysisService.processInboundResponse(req.params.id, rawContent, messageId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 6. TIMELINE & LEAD MEMORY
// ============================================================================

router.get('/leads/:id/timeline', async (req: Request, res: Response) => {
  try {
    const timeline = await LeadMemoryService.getLeadTimeline(req.params.id);
    res.json({ success: true, data: timeline });
  } catch (error: any) {
    res.status(404).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 7. OBSERVABILITY & ANALYTICS
// ============================================================================

router.get('/analytics/manager', async (_req: Request, res: Response) => {
  try {
    const data = await AnalyticsService.getManagerDashboard();
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics/queue', async (_req: Request, res: Response) => {
  try {
    const data = await QueueService.getQueueMetrics();
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 8. CONFIGURATION STATUS
// ============================================================================

/**
 * Reports which integrations are actually wired up, so the UI can tell the
 * user what works right now instead of letting them hit a failure later.
 */
router.get('/config/status', async (_req: Request, res: Response) => {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  res.json({
    success: true,
    data: {
      database,
      // Research, enrichment, signal detection and copywriting need this.
      gemini: { configured: hasUsableGeminiKey() },
      // Without SMTP, approved drafts can still be copied or exported.
      smtp: emailService.describe(),
    },
  });
});

/** Round-trips the SMTP credentials against the server to surface setup errors. */
router.post('/config/smtp/verify', async (_req: Request, res: Response) => {
  const result = await emailService.verify();
  res.status(result.ok ? 200 : 400).json({ success: result.ok, ...result });
});

export default router;
