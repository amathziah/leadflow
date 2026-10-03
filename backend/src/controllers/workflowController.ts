import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { WorkflowStatus } from '@prisma/client';
import logger from '../utils/logger.js';
import deepResearchAgent from '../services/ai/deepResearchAgent.js';

export const getWorkflows = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const workflows = await prisma.workflow.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { leads: true, logs: true, sources: true },
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
      throw new BadRequestError('Mission ID is required');
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: {
        leads: {
          orderBy: { leadScore: 'desc' },
        },
        sources: {
          orderBy: { timestamp: 'desc' },
        },
        logs: {
          orderBy: { timestamp: 'asc' },
        },
        _count: {
          select: { logs: true, leads: true, sources: true },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundError(`Research mission with ID "${id}" not found`);
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
      throw new BadRequestError('Mission ID is required');
    }

    const workflow = await prisma.workflow.findUnique({ where: { id } });
    if (!workflow) {
      throw new NotFoundError(`Research mission with ID "${id}" not found`);
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
    const { query, depth = 'DEEP', targetVertical } = req.body;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      throw new BadRequestError('A research query or objective string is required to start a mission');
    }

    const validDepths = ['QUICK', 'DEEP', 'EXHAUSTIVE'];
    const chosenDepth = validDepths.includes(depth?.toUpperCase()) ? depth.toUpperCase() : 'DEEP';

    // Create the mission in PENDING status
    const workflow = await prisma.workflow.create({
      data: {
        query: query.trim(),
        depth: chosenDepth,
        targetVertical: targetVertical?.trim() || null,
        status: WorkflowStatus.PENDING,
      },
    });

    logger.info(`🎯 Deep Research Mission "${workflow.id}" initialized with query: "${query}" (Depth: ${chosenDepth})`);

    // Asynchronously trigger the autonomous Deep Research Agent execution loop
    deepResearchAgent.executeMission(workflow.id, query.trim(), chosenDepth).catch((err) => {
      logger.error(`Background Deep Research agent failed on mission ${workflow.id}:`, err);
    });

    res.status(201).json({
      success: true,
      message: 'Deep research mission launched successfully',
      data: workflow,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Server-Sent Events (SSE) live telemetry stream.
 * Broadcasts real-time agent thoughts, tool execution, and visual Set-of-Mark screenshots.
 */
export const streamWorkflowTrajectory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let lastLogTime = new Date(0);

  const interval = setInterval(async () => {
    try {
      const workflow = await prisma.workflow.findUnique({
        where: { id },
        include: {
          logs: {
            where: { timestamp: { gt: lastLogTime } },
            orderBy: { timestamp: 'asc' },
          },
          leads: true,
          sources: true,
        },
      });

      if (!workflow) {
        res.write(`data: ${JSON.stringify({ error: 'Mission not found' })}\n\n`);
        clearInterval(interval);
        res.end();
        return;
      }

      if (workflow.logs.length > 0) {
        lastLogTime = workflow.logs[workflow.logs.length - 1].timestamp;
        res.write(`data: ${JSON.stringify({ type: 'LOGS', logs: workflow.logs })}\n\n`);
      }

      res.write(
        `data: ${JSON.stringify({
          type: 'STATUS',
          status: workflow.status,
          confidenceScore: workflow.confidenceScore,
          summary: workflow.summary,
          leadsCount: workflow.leads.length,
          sourcesCount: workflow.sources.length,
          stats: workflow.stats,
          executiveDossier: workflow.executiveDossier,
          plan: workflow.plan,
        })}\n\n`
      );

      if (workflow.status === 'COMPLETED' || workflow.status === 'FAILED') {
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

export const deleteWorkflow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new BadRequestError('Mission ID is required');
    }

    await prisma.workflow.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: 'Research mission deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
