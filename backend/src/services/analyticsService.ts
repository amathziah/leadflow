import { prisma } from '../db/prisma.js';
import { QueueService } from './queueService.js';
import { getOrCreateDefaultContext } from './seedService.js';

export class AnalyticsService {
  /**
   * Sales Manager Executive Dashboard Metrics
   */
  static async getManagerDashboard(orgId?: string) {
    const context = await getOrCreateDefaultContext();

    /**
     * Scope for every count below.
     *
     * LeadFlow runs as a single workspace: no auth, and no other endpoint
     * filters by organisation. This dashboard used to scope to the default
     * context's org while `/leads` returned everything, so the dashboard
     * reported 0 leads while the pipeline listed 23. Unless a caller asks for
     * a specific org, count the whole workspace so the numbers agree with the
     * rest of the app.
     */
    const scope = orgId ? { orgId } : {};
    void context; // ensures the default workspace exists before counting

    const [
      totalCompanies,
      totalLeads,
      statusBreakdown,
      scores,
      outreachStats,
      responseStats,
      users,
      queueMetrics,
    ] = await Promise.all([
      prisma.company.count({ where: scope }),
      prisma.lead.count({ where: scope }),
      prisma.lead.groupBy({
        by: ['status'],
        where: scope,
        _count: { id: true },
      }),
      prisma.lead.aggregate({
        where: { ...scope, leadScore: { not: null } },
        _avg: { leadScore: true },
        _max: { leadScore: true },
        _min: { leadScore: true },
      }),
      prisma.outreachMessage.groupBy({
        by: ['state'],
        _count: { id: true },
      }),
      prisma.inboundResponse.groupBy({
        by: ['classification'],
        _count: { id: true },
      }),
      prisma.user.findMany({
        where: scope,
        include: {
          assignedLeads: { select: { id: true, status: true, leadScore: true } },
          reviewedMessages: { select: { id: true } },
        },
      }),
      QueueService.getQueueMetrics(),
    ]);

    // Map lead status counts
    const statusMap: Record<string, number> = {};
    statusBreakdown.forEach((s) => {
      statusMap[s.status] = s._count.id;
    });

    const candidates = statusMap['CANDIDATE'] || 0;
    const qualified = statusMap['QUALIFIED'] || 0;
    const outreachReady = statusMap['OUTREACH_READY'] || 0;
    const contacted = statusMap['OUTREACH_SENT'] || 0;
    const responded = statusMap['RESPONDED'] || 0;
    const converted = statusMap['CONVERTED'] || 0;
    const disqualified = statusMap['DISQUALIFIED'] || 0;

    // Conversion rates. `null` means "no denominator yet", which the UI renders
    // as an em dash. Earlier these fell back to invented constants (82.5 / 24.3
    // / 8.5), so an empty pipeline displayed healthy-looking performance.
    const rate = (numerator: number, denominator: number): number | null =>
      denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : null;

    const qualificationRate = rate(totalLeads - disqualified, totalLeads);
    const responseRate = rate(responded, contacted);
    const conversionRate = rate(converted, totalLeads);

    /** Share of the previous stage lost, computed from the real counts. */
    const dropoff = (previous: number, current: number): number | null =>
      previous > 0 ? Number((((previous - current) / previous) * 100).toFixed(1)) : null;

    const discoveredCount = candidates + qualified + outreachReady + contacted + responded + converted;
    const qualifiedCount = qualified + outreachReady + contacted + responded + converted;
    const outreachedCount = contacted + responded + converted;
    const respondedCount = responded + converted;

    // Outreach state map
    const outreachMap: Record<string, number> = {};
    outreachStats.forEach((o) => {
      outreachMap[o.state] = o._count.id;
    });

    // Inbound response intent map
    const intentMap: Record<string, number> = {};
    responseStats.forEach((r) => {
      intentMap[r.classification] = r._count.id;
    });

    // Team Performance breakdown
    const teamPerformance = users.map((u) => ({
      userId: u.id,
      name: u.name,
      role: u.role,
      assignedLeadsCount: u.assignedLeads.length,
      reviewedMessagesCount: u.reviewedMessages.length,
      averageScore:
        u.assignedLeads.length > 0
          ? Math.round(
              u.assignedLeads.reduce((acc, l) => acc + (l.leadScore || 0), 0) /
                u.assignedLeads.length
            )
          : 0,
    }));

    return {
      overview: {
        totalCompanies,
        totalLeads,
        qualifiedLeads: qualifiedCount,
        // null when nothing has been scored yet — previously defaulted to 78.
        averageLeadScore:
          scores._avg.leadScore === null ? null : Math.round(scores._avg.leadScore),
        qualificationRatePercent: qualificationRate,
        responseRatePercent: responseRate,
        conversionRatePercent: conversionRate,
      },
      funnel: [
        { stage: 'Discovered', count: discoveredCount, dropoff: null },
        {
          stage: 'Qualified',
          count: qualifiedCount,
          dropoff: dropoff(discoveredCount, qualifiedCount),
        },
        {
          stage: 'Outreach sent',
          count: outreachedCount,
          dropoff: dropoff(qualifiedCount, outreachedCount),
        },
        {
          stage: 'Replied',
          count: respondedCount,
          dropoff: dropoff(outreachedCount, respondedCount),
        },
        {
          stage: 'Converted',
          count: converted,
          dropoff: dropoff(respondedCount, converted),
        },
      ],
      outreachPipeline: {
        draftsPendingReview: outreachMap['DRAFT'] || 0,
        inReviewQueue: outreachMap['REVIEW'] || 0,
        approvedReadyToSend: outreachMap['APPROVED'] || 0,
        dispatchedSent: outreachMap['SENT'] || 0,
      },
      responseClassifications: {
        interested: intentMap['INTERESTED'] || 0,
        followUp: intentMap['FOLLOW_UP'] || 0,
        notInterested: intentMap['NOT_INTERESTED'] || 0,
        unsubscribe: intentMap['UNSUBSCRIBE'] || 0,
      },
      teamPerformance,
      observability: queueMetrics,
    };
  }

  /**
   * Salesperson Lead 360 View
   */
  static async getSalespersonLead360(leadId: string) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        company: {
          include: {
            signals: { orderBy: { detectedAt: 'desc' } },
            researchDossiers: { orderBy: { generatedAt: 'desc' }, take: 1 },
            enrichments: true,
          },
        },
        scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
        outreachMessages: {
          orderBy: { createdAt: 'desc' },
          include: { responses: true },
        },
        memoryItems: { orderBy: { timestamp: 'desc' } },
      },
    });

    if (!lead) throw new Error(`Lead not found: ${leadId}`);

    const latestScore = lead.scores[0];
    const dossier = lead.company?.researchDossiers[0];

    return {
      lead: {
        id: lead.id,
        fullName: lead.fullName,
        email: lead.email,
        role: lead.role || lead.contactRole,
        companyName: lead.companyName,
        website: lead.website || lead.company?.website,
        industry: lead.industry || lead.company?.industry,
        country: lead.company?.country,
        employeeCount: lead.company?.employeeCount,
        technologies: lead.company?.technologies || [],
        fundingStage: lead.company?.fundingStage,
        status: lead.status,
        conversationStage: lead.conversationStage,
      },
      score: {
        totalScore: latestScore?.totalScore ?? lead.leadScore ?? null,
        formulaVersion: latestScore?.formulaVersion || 'v1.0.0',
        scoredAt: latestScore?.scoredAt,
        explanation: latestScore?.explanation || [],
      },
      signals: lead.company?.signals || [],
      research: dossier
        ? {
            summary: dossier.summary,
            painPoints: dossier.painPoints,
            strategicSignals: dossier.strategicSignals,
            qualificationReasons: dossier.qualificationReasons,
            confidenceScore: dossier.confidenceScore,
            generatedAt: dossier.generatedAt,
          }
        : null,
      outreach: lead.outreachMessages.map((m) => ({
        id: m.id,
        channel: m.channel,
        state: m.state,
        subject: m.subject,
        body: m.body,
        usedSignals: m.usedSignals,
        approvedAt: m.approvedAt,
        sentAt: m.sentAt,
        responses: m.responses,
      })),
      history: lead.memoryItems,
    };
  }
}
