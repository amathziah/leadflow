import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { JobStatus } from '@prisma/client';
import { getOrCreateDefaultContext } from '../workspaces/seedService.js';
import { EnrichmentService } from '../companies/enrichmentService.js';
import { SignalEngine } from '../companies/signalEngine.js';
import { QualificationService } from '../leads/qualificationService.js';
import { ScoringService } from '../leads/scoringService.js';
import { ResearchAgentService } from '../research/researchAgentService.js';
import { PersonalizationService } from '../outreach/personalizationService.js';
import logger from '../../shared/logger.js';

export interface EnqueueJobOptions {
  queueName?: string;
  jobType: 'PROCESS_LEAD_PIPELINE' | 'ENRICH_COMPANY' | 'DETECT_SIGNALS' | 'QUALIFY_LEAD' | 'SCORE_LEAD' | 'RUN_RESEARCH' | 'GENERATE_OUTREACH';
  payload: Record<string, any>;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export interface PipelineProgressEvent {
  jobId: string;
  leadId: string;
  companyId: string;
  stage: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  details?: string;
  data?: any;
}

export class QueueService {
  private static isWorkerRunning = false;
  private static workerInterval: NodeJS.Timeout | null = null;

  // Real-time telemetry counters
  public static metrics = {
    leadsProcessed: 0,
    failures: 0,
    retries: 0,
    deadLetterQueueCount: 0,
    totalLatencyMs: 0,
  };

  /** Persist a best-effort lifecycle event without allowing observability to
   * change pipeline behavior if the audit write itself is unavailable. */
  private static async recordAgentStage(
    leadId: string,
    companyId: string,
    runId: string,
    stage: string,
    status: 'RUNNING' | 'COMPLETED' | 'FAILED',
    details?: Record<string, unknown>
  ) {
    try {
      await prisma.leadMemoryItem.create({
        data: {
          leadId,
          companyId,
          eventType: 'AGENT_STAGE',
          deltaDescription: `${stage}: ${status.toLowerCase()}`,
          metadata: JSON.parse(JSON.stringify({ runId, stage, status, ...details })) as any,
        },
      });
    } catch (error: any) {
      logger.warn(`Could not persist agent trace event for ${stage}: ${error.message}`);
    }
  }

  private static async runTracedStage<T>(
    leadId: string,
    companyId: string,
    runId: string,
    stage: string,
    action: () => Promise<T>,
    describe: (result: T) => Record<string, unknown> = () => ({})
  ): Promise<T> {
    const startedAt = Date.now();
    await this.recordAgentStage(leadId, companyId, runId, stage, 'RUNNING');
    try {
      const result = await action();
      await this.recordAgentStage(leadId, companyId, runId, stage, 'COMPLETED', {
        durationMs: Date.now() - startedAt,
        ...describe(result),
      });
      return result;
    } catch (error: any) {
      await this.recordAgentStage(leadId, companyId, runId, stage, 'FAILED', {
        durationMs: Date.now() - startedAt,
        error: error.message || String(error),
      });
      throw error;
    }
  }

  /**
   * Generates a deterministic idempotency key
   */
  static generateIdempotencyKey(jobType: string, entityId: string, bucket = 'hourly'): string {
    const timeBucket = bucket === 'hourly' ? new Date().toISOString().slice(0, 13) : 'infinite';
    return crypto.createHash('sha256').update(`${jobType}:${entityId}:${timeBucket}`).digest('hex');
  }

  /**
   * Enqueue a job with idempotency and duplicate prevention
   */
  static async enqueueJob(options: EnqueueJobOptions, orgId?: string) {
    const context = await getOrCreateDefaultContext();
    const effectiveOrgId = orgId || context.organizationId;

    const idempotencyKey =
      options.idempotencyKey ||
      this.generateIdempotencyKey(options.jobType, options.payload.leadId || options.payload.companyId || 'global');

    // 1. Duplicate Prevention Check
    const existing = await prisma.jobQueueItem.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      if (existing.status === JobStatus.WAITING || existing.status === JobStatus.ACTIVE) {
        logger.info(`🛡️ Idempotent skip: Job already queued or active with key: ${idempotencyKey}`);
        return existing;
      }
      if (existing.status === JobStatus.COMPLETED) {
        logger.info(`🛡️ Idempotent skip: Job recently completed with key: ${idempotencyKey}`);
        return existing;
      }
    }

    // 2. Persist new job
    const job = await prisma.jobQueueItem.create({
      data: {
        orgId: effectiveOrgId,
        queueName: options.queueName || 'lead-pipeline',
        jobType: options.jobType,
        payload: options.payload,
        status: JobStatus.WAITING,
        maxAttempts: options.maxAttempts || 3,
        idempotencyKey,
      },
    });

    logger.info(`📥 Enqueued job ${job.id} [${job.jobType}] (Idempotency: ${idempotencyKey.slice(0, 10)}...)`);

    // Ensure worker loop is running
    this.startWorker();

    return job;
  }

  /**
   * Starts background worker loop to process jobs
   */
  static startWorker() {
    if (this.isWorkerRunning) return;
    this.isWorkerRunning = true;

    logger.info('⚙️ Queue Worker started (polling queue every 1500ms with DLQ and backoff)...');
    this.workerInterval = setInterval(() => {
      this.processNextJob().catch((err) => {
        logger.error('Error during queue processing loop:', err);
      });
    }, 1500);
  }

  static stopWorker() {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
    this.isWorkerRunning = false;
    logger.info('⏹️ Queue Worker stopped.');
  }

  /**
   * Processes the next waiting job in the queue
   */
  static async processNextJob() {
    const job = await prisma.jobQueueItem.findFirst({
      where: {
        status: JobStatus.WAITING,
        scheduledAt: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!job) return;

    // Mark ACTIVE
    await prisma.jobQueueItem.update({
      where: { id: job.id },
      data: {
        status: JobStatus.ACTIVE,
        attempts: { increment: 1 },
      },
    });

    const startTime = Date.now();

    try {
      logger.info(`▶️ [Worker] Executing Job ${job.id} (${job.jobType}, attempt ${job.attempts + 1}/${job.maxAttempts})`);

      await this.executeJobLogic(job);

      const duration = Date.now() - startTime;
      this.metrics.leadsProcessed++;
      this.metrics.totalLatencyMs += duration;

      await prisma.jobQueueItem.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          processedAt: new Date(),
        },
      });

      logger.info(`✅ [Worker] Job ${job.id} completed successfully in ${duration}ms.`);
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const currentAttempts = job.attempts + 1;
      const errorMsg = err.message || String(err);

      logger.error(`❌ [Worker] Job ${job.id} failed on attempt ${currentAttempts}: ${errorMsg}`);

      if (currentAttempts < job.maxAttempts) {
        // Exponential backoff: Delay = 1000 * 2^attempts + jitter
        this.metrics.retries++;
        const backoffMs = Math.min(30000, 1500 * Math.pow(2, currentAttempts) + Math.random() * 500);
        const nextSchedule = new Date(Date.now() + backoffMs);

        await prisma.jobQueueItem.update({
          where: { id: job.id },
          data: {
            status: JobStatus.WAITING,
            scheduledAt: nextSchedule,
            lastError: `Attempt ${currentAttempts} failed: ${errorMsg}`,
          },
        });
        logger.info(`🔁 Scheduled retry for Job ${job.id} in ${Math.round(backoffMs / 1000)}s.`);
      } else {
        // Move to Dead-Letter Queue (DLQ)
        this.metrics.failures++;
        this.metrics.deadLetterQueueCount++;

        await prisma.jobQueueItem.update({
          where: { id: job.id },
          data: {
            status: JobStatus.DLQ,
            lastError: `DEAD-LETTER QUEUE: Exhausted ${job.maxAttempts} attempts. Error: ${errorMsg}`,
            processedAt: new Date(),
          },
        });

        logger.error(`💀 [DLQ] Job ${job.id} moved to Dead-Letter Queue. Stack: ${err.stack}`);
      }
    }
  }

  /**
   * Dispatches job execution to corresponding domain services
   */
  private static async executeJobLogic(job: any) {
    const payload = job.payload as Record<string, any>;

    switch (job.jobType) {
      case 'PROCESS_LEAD_PIPELINE': {
        const leadId = payload.leadId;
        const companyId = payload.companyId;
        const runId = `${job.id}:${job.attempts + 1}`;

        // Stage 1: Deterministic Qualification Check
        const qual = await this.runTracedStage(leadId, companyId, runId, 'ICP qualification',
          () => QualificationService.evaluateLead(leadId),
          (result) => ({
            qualified: result.qualification.isQualified,
            checks: result.qualification.checks,
            reasons: result.qualification.reasons,
            disqualificationReasons: result.qualification.disqualificationReasons,
          })
        );
        if (!qual.qualification.isQualified) {
          logger.info(`Lead ${leadId} disqualified deterministically. Pipeline stopped.`);
          return;
        }

        // Stage 2: Data Enrichment
        await this.runTracedStage(leadId, companyId, runId, 'Company enrichment',
          () => EnrichmentService.enrichCompany(companyId),
          (result) => ({
            generatedBy: result.generatedBy,
            fallbackReason: result.fallbackReason,
            fieldsUpdated: result.records.map((record) => ({ field: record.field, source: record.source, confidence: record.confidence })),
            recordsCreated: result.records.length,
          })
        );

        // Stage 3: Signal Detection
        await this.runTracedStage(leadId, companyId, runId, 'Market signal detection',
          () => SignalEngine.detectSignalsWithProvenance(companyId),
          (result) => ({
            generatedBy: result.generatedBy,
            fallbackReason: result.fallbackReason,
            signalCount: result.signals.length,
          })
        );

        // Stage 4: Multi-Factor Lead Scoring
        await this.runTracedStage(leadId, companyId, runId, 'Lead scoring',
          () => ScoringService.scoreLead(leadId),
          (result) => ({ totalScore: result.totalScore, formulaVersion: result.formulaVersion, explanation: result.explanation })
        );

        // Stage 5: AI Research Agent Dossier Synthesis
        await this.runTracedStage(leadId, companyId, runId, 'Research synthesis',
          () => ResearchAgentService.runResearch(companyId),
          (result) => ({ generatedBy: result.generatedBy, fallbackReason: result.fallbackReason, model: result.model, tools: result.tools })
        );

        // Stage 6: Evidence-Grounded Outreach Personalization
        await this.runTracedStage(leadId, companyId, runId, 'Outreach drafting',
          () => PersonalizationService.generateOutreach(leadId),
          (result) => ({
            messageId: result.messageId,
            generatedBy: result.generatedBy,
            fallbackReason: result.fallbackReason,
            usedSignals: result.usedSignals,
          })
        );

        break;
      }

      case 'ENRICH_COMPANY':
        await EnrichmentService.enrichCompany(payload.companyId);
        break;

      case 'DETECT_SIGNALS':
        await SignalEngine.detectSignals(payload.companyId);
        break;

      case 'QUALIFY_LEAD':
        await QualificationService.evaluateLead(payload.leadId);
        break;

      case 'SCORE_LEAD':
        await ScoringService.scoreLead(payload.leadId);
        break;

      case 'RUN_RESEARCH':
        await ResearchAgentService.runResearch(payload.companyId);
        break;

      case 'GENERATE_OUTREACH':
        await PersonalizationService.generateOutreach(payload.leadId);
        break;

      default:
        throw new Error(`Unknown jobType: ${job.jobType}`);
    }
  }

  /**
   * Retrieves queue metrics for observability dashboard
   */
  static async getQueueMetrics() {
    const counts = await prisma.jobQueueItem.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const statusCounts: Record<string, number> = {
      WAITING: 0,
      ACTIVE: 0,
      COMPLETED: 0,
      FAILED: 0,
      DLQ: 0,
    };

    counts.forEach((c) => {
      statusCounts[c.status] = c._count.id;
    });

    const avgLatency =
      this.metrics.leadsProcessed > 0
        ? Math.round(this.metrics.totalLatencyMs / this.metrics.leadsProcessed)
        : null;

    return {
      activeQueueSize: statusCounts.WAITING + statusCounts.ACTIVE,
      waiting: statusCounts.WAITING,
      active: statusCounts.ACTIVE,
      completed: statusCounts.COMPLETED,
      dlq: statusCounts.DLQ,
      failures: this.metrics.failures + statusCounts.DLQ,
      retries: this.metrics.retries,
      leadsProcessed: this.metrics.leadsProcessed,
      averageLatencyMs: avgLatency,
    };
  }
}
