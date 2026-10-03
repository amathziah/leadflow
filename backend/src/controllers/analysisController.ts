import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { WorkflowStatus } from '@prisma/client';
import logger from '../utils/logger.js';
import competitorAnalysisAgent from '../services/ai/competitorAnalysisAgent.js';

/**
 * GET /api/analyses — list all analyses
 */
export const getAnalyses = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const analyses = await prisma.workflow.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { leads: true, logs: true, sources: true } },
      },
    });

    res.status(200).json({ success: true, data: analyses });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analyses/:id — get a single analysis with all details
 */
export const getAnalysisById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) throw new BadRequestError('Analysis ID is required');

    const analysis = await prisma.workflow.findUnique({
      where: { id },
      include: {
        leads: { orderBy: { leadScore: 'desc' } },
        sources: { orderBy: { timestamp: 'desc' } },
        logs: { orderBy: { timestamp: 'asc' } },
        _count: { select: { logs: true, leads: true, sources: true } },
      },
    });

    if (!analysis) throw new NotFoundError(`Analysis with ID "${id}" not found`);

    res.status(200).json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analyses/:id/logs — get execution logs for an analysis
 */
export const getAnalysisLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) throw new BadRequestError('Analysis ID is required');

    const analysis = await prisma.workflow.findUnique({ where: { id } });
    if (!analysis) throw new NotFoundError(`Analysis with ID "${id}" not found`);

    const logs = await prisma.executionLog.findMany({
      where: { workflowId: id },
      orderBy: { timestamp: 'asc' },
    });

    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/analyses — launch a new competitor analysis
 * Body: { yourCompany: string, competitors: string[], focus?: string[] }
 */
export const triggerAnalysis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { yourCompany, competitors, focus = [] } = req.body;

    if (!yourCompany || typeof yourCompany !== 'string' || !yourCompany.trim()) {
      throw new BadRequestError('yourCompany (string) is required');
    }
    if (!competitors || !Array.isArray(competitors) || competitors.length === 0) {
      throw new BadRequestError('competitors (non-empty array of strings) is required');
    }

    const cleanedCompetitors: string[] = competitors.map((c: any) => String(c).trim()).filter(Boolean);
    if (cleanedCompetitors.length === 0) {
      throw new BadRequestError('At least one valid competitor name is required');
    }

    const focusAreas: string[] = Array.isArray(focus)
      ? focus.map((f: any) => String(f).trim()).filter(Boolean)
      : ['Pricing', 'Features', 'Tech Stack', 'Positioning'];

    // Build a descriptive query for storage
    const query = `${yourCompany.trim()} vs ${cleanedCompetitors.join(', ')}`;

    // Create analysis record in PENDING state
    const analysis = await prisma.workflow.create({
      data: {
        query,
        depth: 'DEEP',
        targetVertical: focusAreas.join(', '),
        status: WorkflowStatus.PENDING,
      },
    });

    logger.info(`🎯 Competitor Analysis "${analysis.id}" launched: ${query}`);

    // Kick off async agent
    competitorAnalysisAgent
      .executeAnalysis(analysis.id, yourCompany.trim(), cleanedCompetitors, focusAreas)
      .catch((err) => {
        logger.error(`Background analysis agent failed on job ${analysis.id}:`, err);
      });

    res.status(201).json({
      success: true,
      message: 'Competitor analysis launched successfully',
      data: analysis,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analyses/:id/stream — SSE live trajectory stream
 */
export const streamAnalysisTrajectory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let lastLogTime = new Date(0);

  const interval = setInterval(async () => {
    try {
      const analysis = await prisma.workflow.findUnique({
        where: { id },
        include: {
          logs: {
            where: { timestamp: { gt: lastLogTime } },
            orderBy: { timestamp: 'asc' },
          },
          leads: { select: { id: true, companyName: true, leadScore: true } },
          sources: { select: { id: true, url: true, domain: true, title: true } },
        },
      });

      if (!analysis) {
        res.write(`data: ${JSON.stringify({ error: 'Analysis not found' })}\n\n`);
        clearInterval(interval);
        res.end();
        return;
      }

      if (analysis.logs.length > 0) {
        lastLogTime = analysis.logs[analysis.logs.length - 1].timestamp;
        res.write(`data: ${JSON.stringify({ type: 'LOGS', logs: analysis.logs })}\n\n`);
      }

      res.write(
        `data: ${JSON.stringify({
          type: 'STATUS',
          status: analysis.status,
          confidenceScore: analysis.confidenceScore,
          summary: analysis.summary,
          competitorsCount: analysis.leads.length,
          sourcesCount: analysis.sources.length,
          stats: analysis.stats,
          executiveDossier: analysis.executiveDossier,
          plan: analysis.plan,
        })}\n\n`
      );

      if (analysis.status === 'COMPLETED' || analysis.status === 'FAILED') {
        clearInterval(interval);
        res.end();
      }
    } catch {
      clearInterval(interval);
      res.end();
    }
  }, 1200);

  req.on('close', () => {
    clearInterval(interval);
  });
};

/**
 * DELETE /api/analyses/:id — delete an analysis and all its data
 */
export const deleteAnalysis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) throw new BadRequestError('Analysis ID is required');

    await prisma.workflow.delete({ where: { id } });

    res.status(200).json({ success: true, message: 'Analysis deleted successfully' });
  } catch (error) {
    next(error);
  }
};
