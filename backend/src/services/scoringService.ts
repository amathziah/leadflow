import { prisma } from '../db/prisma.js';
import { IcpService } from './icpService.js';
import logger from '../utils/logger.js';

export interface ScoreExplanationItem {
  factor: string;
  points: number;
  max: number;
  reason: string;
}

export interface ScoreCalculationResult {
  totalScore: number;
  breakdown: {
    industryFit: number;
    companySize: number;
    growthSignals: number;
    technologyFit: number;
    roleFit: number;
    engagement: number;
  };
  explanation: ScoreExplanationItem[];
  formulaVersion: string;
  timestamp: string;
  previousScore: number | null;
  scoreDelta: number | null;
  changeReason?: string;
}

export class ScoringService {
  public static readonly FORMULA_VERSION = 'v1.0.0';

  /**
   * Calculates multi-factor explainable score for a Lead & Company
   */
  static async scoreLead(leadId: string): Promise<ScoreCalculationResult> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        company: {
          include: {
            signals: true,
          },
        },
        scores: {
          orderBy: { scoredAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!lead || !lead.company) {
      throw new Error(`Lead or associated company not found: ${leadId}`);
    }

    const company = lead.company;
    const icp = await IcpService.getActiveIcp(lead.orgId || undefined);

    const explanation: ScoreExplanationItem[] = [];

    // 1. Industry Fit (Max 25 pts)
    let industryPoints = 0;
    const ind = (company.industry || lead.industry || '').toLowerCase();
    if (ind.includes('saas') || ind.includes('software') || ind.includes('fintech') || ind.includes('ai')) {
      industryPoints = 25;
      explanation.push({
        factor: 'Industry Fit (25%)',
        points: 25,
        max: 25,
        reason: `+25 ${company.industry || 'B2B SaaS'} direct match with target vertical`,
      });
    } else {
      industryPoints = 12;
      explanation.push({
        factor: 'Industry Fit (25%)',
        points: 12,
        max: 25,
        reason: `+12 Partial industry fit (${company.industry || 'General'})`,
      });
    }

    // 2. Company Size Fit (Max 20 pts)
    let sizePoints = 0;
    const count = company.employeeCount;
    if (count && count >= 50 && count <= 500) {
      if (count >= 100 && count <= 350) {
        sizePoints = 20;
        explanation.push({
          factor: 'Company Size (20%)',
          points: 20,
          max: 20,
          reason: `+20 Optimal headcount (${count} employees in 100-350 sweet-spot)`,
        });
      } else {
        sizePoints = 18;
        explanation.push({
          factor: 'Company Size (20%)',
          points: 18,
          max: 20,
          reason: `+18 Headcount (${count} employees) within 50-500 bracket`,
        });
      }
    } else {
      sizePoints = 10;
      explanation.push({
        factor: 'Company Size (20%)',
        points: 10,
        max: 20,
        reason: count ? `+10 Headcount (${count}) outside ideal bracket` : `+10 Estimated headcount provisional credit`,
      });
    }

    // 3. Growth Signals (Max 20 pts)
    let growthPoints = 0;
    const signals = company.signals;
    const hasFunding = signals.some((s) => s.type === 'FUNDING_ROUND') || Boolean(company.fundingStage);
    const hasHiring = signals.some((s) => s.type === 'HIRING_GROWTH');
    const hasExpansion = signals.some((s) => s.type === 'GEO_EXPANSION');

    const growthReasons: string[] = [];
    if (hasFunding) {
      growthPoints += 10;
      growthReasons.push(`+10 ${company.fundingStage || 'Recent'} funding round`);
    }
    if (hasHiring) {
      growthPoints += 10;
      growthReasons.push(`+10 Hiring growth in finance & executive roles`);
    }
    if (growthPoints < 20 && hasExpansion) {
      const add = Math.min(5, 20 - growthPoints);
      growthPoints += add;
      growthReasons.push(`+${add} Market geo-expansion`);
    }
    if (growthPoints === 0) {
      growthPoints = 5;
      growthReasons.push('+5 Baseline market activity');
    }

    explanation.push({
      factor: 'Growth Signals (20%)',
      points: Math.min(20, growthPoints),
      max: 20,
      reason: growthReasons.join('; '),
    });

    // 4. Technology Fit (Max 15 pts)
    let techPoints = 0;
    const techs = company.technologies;
    const targetTechs = icp?.requiredTechnologies || ['Stripe', 'Salesforce', 'NetSuite', 'AWS'];
    const matchedTechs = techs.filter((t) =>
      targetTechs.some((target) => t.toLowerCase().includes(target.toLowerCase()))
    );

    if (matchedTechs.length >= 3) {
      techPoints = 15;
      explanation.push({
        factor: 'Technology Fit (15%)',
        points: 15,
        max: 15,
        reason: `+15 Stack match: ${matchedTechs.slice(0, 3).join(', ')}`,
      });
    } else if (matchedTechs.length > 0) {
      techPoints = 10;
      explanation.push({
        factor: 'Technology Fit (15%)',
        points: 10,
        max: 15,
        reason: `+10 Stack match: ${matchedTechs.join(', ')}`,
      });
    } else {
      techPoints = 5;
      explanation.push({
        factor: 'Technology Fit (15%)',
        points: 5,
        max: 15,
        reason: `+5 Standard cloud infrastructure deployment`,
      });
    }

    // 5. Role Fit (Max 10 pts)
    let rolePoints = 0;
    const role = (lead.role || lead.contactRole || '').toLowerCase();
    if (role.includes('cfo') || role.includes('chief financial') || role.includes('vp finance') || role.includes('founder') || role.includes('ceo')) {
      rolePoints = 10;
      explanation.push({
        factor: 'Role Fit (10%)',
        points: 10,
        max: 10,
        reason: `+10 Direct ${lead.role || 'CFO'} decision-maker target persona`,
      });
    } else if (role.includes('director') || role.includes('head') || role.includes('controller')) {
      rolePoints = 8;
      explanation.push({
        factor: 'Role Fit (10%)',
        points: 8,
        max: 10,
        reason: `+8 High-influence finance/sales leadership role (${lead.role})`,
      });
    } else {
      rolePoints = 5;
      explanation.push({
        factor: 'Role Fit (10%)',
        points: 5,
        max: 10,
        reason: `+5 General operational contact (${lead.role || 'Key contact'})`,
      });
    }

    // 6. Engagement / Timing (Max 10 pts)
    let engagementPoints = 8;
    if (lead.conversationStage === 'ENGAGED' || lead.conversationStage === 'CONNECTED') {
      engagementPoints = 10;
      explanation.push({
        factor: 'Engagement / Timing (10%)',
        points: 10,
        max: 10,
        reason: `+10 Active conversational engagement recorded`,
      });
    } else {
      explanation.push({
        factor: 'Engagement / Timing (10%)',
        points: 8,
        max: 10,
        reason: `+8 High-propensity timing based on recent signal cadence`,
      });
    }

    const totalScore = Math.min(
      100,
      industryPoints + sizePoints + Math.min(20, growthPoints) + techPoints + rolePoints + engagementPoints
    );

    const previousScore = lead.leadScore;
    const scoreDelta = previousScore !== null ? totalScore - previousScore : null;

    let changeReason: string | undefined;
    if (scoreDelta !== null && scoreDelta !== 0) {
      changeReason =
        scoreDelta > 0
          ? `Score increased by +${scoreDelta} pts (${previousScore} -> ${totalScore}) due to verified growth signals and tech stack match.`
          : `Score recalibrated by ${scoreDelta} pts (${previousScore} -> ${totalScore}).`;

      // Persist in Lead Memory
      await prisma.leadMemoryItem.create({
        data: {
          leadId: lead.id,
          companyId: company.id,
          eventType: 'SCORE_CHANGE',
          deltaDescription: changeReason,
          previousScore: previousScore,
          newScore: totalScore,
          metadata: { breakdown: explanation as any },
        },
      });
      logger.info(`📈 Lead Memory: Score change detected for ${lead.fullName} (${company.name}): ${previousScore} -> ${totalScore}`);
    }

    // Save score record
    await prisma.leadScore.create({
      data: {
        leadId: lead.id,
        companyId: company.id,
        totalScore,
        industryFitScore: industryPoints,
        sizeFitScore: sizePoints,
        growthFitScore: Math.min(20, growthPoints),
        techFitScore: techPoints,
        roleFitScore: rolePoints,
        engagementScore: engagementPoints,
        formulaVersion: this.FORMULA_VERSION,
        explanation: explanation as any,
      },
    });

    // Update cached lead score on Lead
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        leadScore: totalScore,
      },
    });

    logger.info(`🎯 Lead Scored: ${lead.fullName} (${company.name}) Total: ${totalScore}/100 [Version ${this.FORMULA_VERSION}]`);

    return {
      totalScore,
      breakdown: {
        industryFit: industryPoints,
        companySize: sizePoints,
        growthSignals: Math.min(20, growthPoints),
        technologyFit: techPoints,
        roleFit: rolePoints,
        engagement: engagementPoints,
      },
      explanation,
      formulaVersion: this.FORMULA_VERSION,
      timestamp: new Date().toISOString(),
      previousScore,
      scoreDelta,
      changeReason,
    };
  }
}
