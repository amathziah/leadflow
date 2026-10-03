import { prisma } from '../db/prisma.js';
import { IcpService } from './icpService.js';
import logger from '../utils/logger.js';

export interface QualificationResult {
  isQualified: boolean;
  scoreAdjustment: number;
  checks: {
    industryMatch: { passed: boolean; value: string | null; reason: string };
    companySizeMatch: { passed: boolean; value: number | null; reason: string };
    countryMatch: { passed: boolean; value: string | null; reason: string };
    roleMatch: { passed: boolean; value: string | null; reason: string };
  };
  reasons: string[];
  disqualificationReasons: string[];
}

/**
 * Tokens that describe *how* something is delivered rather than *what market*
 * it serves. When a company's industry is a target industry plus only these,
 * it is still the same vertical ("FinTech SaaS" is FinTech). Anything else
 * left over is a real qualifier that changes the vertical
 * ("Agriculture Software" is agriculture, not software).
 */
const GENERIC_INDUSTRY_TOKENS = new Set([
  'saas', 'software', 'platform', 'platforms', 'solutions', 'services', 'technologies',
  'technology', 'tech', 'systems', 'tools', 'products', 'company', 'inc', 'ltd', 'llc',
  'corp', 'corporation', 'group', 'co', 'and', 'the', 'b2b', 'cloud', 'digital', 'online',
]);

/**
 * Title fragments that indicate someone supports a decision maker rather than
 * being one. Without this, substring matching accepts
 * "Executive Assistant to the CEO" as a CEO.
 */
const NON_DECISION_MAKER_MARKERS = [
  'assistant', 'intern', 'trainee', 'apprentice', 'coordinator', 'receptionist',
  'secretary', 'chief of staff to', 'reports to', 'deputy to', 'support',
];

const normalize = (value: string): string => value.trim().toLowerCase().replace(/[.,/&]+/g, ' ').replace(/\s+/g, ' ');

const tokenize = (value: string): string[] => normalize(value).split(' ').filter(Boolean);

/** Whole-phrase, word-boundary containment — never a bare substring test. */
const containsPhrase = (haystack: string, phrase: string): boolean => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(haystack);
};

export class QualificationService {
  /**
   * Deterministically qualifies a single Company & Lead against an ICP Profile.
   * STRICT RULE: Absolutely NO LLM is used here. 100% deterministic rules.
   *
   * Matching is token-aware rather than substring-based. An earlier version
   * used `String.includes` in both directions, which the evaluation suite
   * showed over-accepting adjacent verticals and support staff
   * (see `evals/datasets/qualification.ts`).
   *
   * Unknown values are treated asymmetrically, by risk:
   *   - unknown headcount -> provisionally accepted, pending enrichment
   *   - unknown country   -> rejected; sending into an unverified region is a
   *                          compliance risk, not a guess worth taking
   *   - unknown role      -> rejected; cannot confirm a decision maker
   */
  static qualify(
    company: {
      industry?: string | null;
      employeeCount?: number | null;
      country?: string | null;
    },
    lead: {
      role?: string | null;
      fullName?: string | null;
    },
    icp: {
      targetIndustries: string[];
      minEmployees: number;
      maxEmployees: number;
      targetCountries: string[];
      targetRoles: string[];
    }
  ): QualificationResult {
    const reasons: string[] = [];
    const disqualificationReasons: string[] = [];

    // 1. Industry Match
    const companyIndustry = normalize(company.industry || '');
    const industryPassed =
      icp.targetIndustries.length === 0 ||
      (companyIndustry.length > 0 &&
        icp.targetIndustries.some((ti) => {
          const target = normalize(ti);
          if (!target) return false;
          if (companyIndustry === target) return true;
          const targetTokens = new Set(tokenize(target));
          const companyTokens = tokenize(companyIndustry);

          // Narrower label than the target ("SaaS" vs "B2B SaaS"): every token
          // the company gives us is part of the target, so it is the same vertical.
          if (companyTokens.every((t) => targetTokens.has(t))) return true;

          // Wider label: the target must appear as a whole phrase, and whatever
          // remains may only be generic delivery words — otherwise it is a
          // different vertical ("Agriculture Software" is agriculture).
          if (!containsPhrase(companyIndustry, target)) return false;
          return companyTokens
            .filter((t) => !targetTokens.has(t))
            .every((t) => GENERIC_INDUSTRY_TOKENS.has(t));
        }));

    const industryCheck = {
      passed: industryPassed,
      value: company.industry || null,
      reason: industryPassed
        ? `Industry '${company.industry}' matches target criteria (${icp.targetIndustries.join(', ')})`
        : !companyIndustry
        ? `Industry is unknown; cannot confirm a match against (${icp.targetIndustries.join(', ')})`
        : `Industry '${company.industry}' does not match target industries (${icp.targetIndustries.join(', ')})`,
    };

    if (industryPassed) {
      reasons.push(industryCheck.reason);
    } else {
      disqualificationReasons.push(industryCheck.reason);
    }

    // 2. Company Size Match
    const size = company.employeeCount ?? null;
    let sizePassed = false;
    let sizeReason = '';

    if (size === null) {
      // Pending enrichment, don't disqualify immediately on size if unknown, but note it
      sizePassed = true;
      sizeReason = `Employee count unknown; provisionally accepted pending enrichment.`;
      reasons.push(sizeReason);
    } else if (size >= icp.minEmployees && size <= icp.maxEmployees) {
      sizePassed = true;
      sizeReason = `Employee count (${size}) falls within target bracket (${icp.minEmployees}–${icp.maxEmployees}).`;
      reasons.push(sizeReason);
    } else {
      sizePassed = false;
      sizeReason = `Employee count (${size}) outside target bracket (${icp.minEmployees}–${icp.maxEmployees}).`;
      disqualificationReasons.push(sizeReason);
    }

    const companySizeCheck = {
      passed: sizePassed,
      value: size,
      reason: sizeReason,
    };

    // 3. Country / Geography Match
    const country = (company.country || '').trim().toLowerCase();
    const normalizeCountry = (c: string) => {
      if (['us', 'usa', 'united states', 'america'].includes(c)) return 'us';
      if (['uk', 'united kingdom', 'great britain', 'england'].includes(c)) return 'uk';
      if (['india', 'in', 'ind'].includes(c)) return 'india';
      if (['ca', 'canada'].includes(c)) return 'canada';
      return c;
    };

    const normCompanyCountry = normalizeCountry(country);
    const countryPassed =
      icp.targetCountries.length === 0 ||
      (country.length > 0 &&
        icp.targetCountries.some(
          (tc) => normalizeCountry(tc.trim().toLowerCase()) === normCompanyCountry
        ));

    const countryCheck = {
      passed: countryPassed,
      value: company.country || null,
      reason: countryPassed
        ? `Location '${company.country || 'Any'}' matches target countries (${icp.targetCountries.join(', ')})`
        : !country
        ? `Location is unknown; cannot confirm the account is in a target region (${icp.targetCountries.join(', ')})`
        : `Location '${company.country}' does not match target countries (${icp.targetCountries.join(', ')})`,
    };

    if (countryPassed) {
      reasons.push(countryCheck.reason);
    } else {
      disqualificationReasons.push(countryCheck.reason);
    }

    // 4. Role Match
    const role = normalize(lead.role || '');
    const isSupportRole = NON_DECISION_MAKER_MARKERS.some((marker) => role.includes(marker));

    const rolePassed =
      icp.targetRoles.length === 0 ||
      (role.length > 0 &&
        !isSupportRole &&
        icp.targetRoles.some((tr) => {
          const targetRole = normalize(tr);
          if (!targetRole) return false;
          if (role === targetRole) return true;
          if (containsPhrase(role, targetRole)) return true;
          // Recognised equivalents, matched on whole words only.
          if (targetRole.includes('cfo') && containsPhrase(role, 'chief financial officer')) return true;
          if (targetRole.includes('ceo') && containsPhrase(role, 'chief executive officer')) return true;
          if (
            targetRole.includes('founder') &&
            (containsPhrase(role, 'co founder') || containsPhrase(role, 'owner'))
          ) {
            return true;
          }
          return false;
        }));

    const roleCheck = {
      passed: rolePassed,
      value: lead.role || null,
      reason: rolePassed
        ? `Role '${lead.role}' aligns with target personas (${icp.targetRoles.join(', ')})`
        : !role
        ? `Role is unknown; cannot confirm this contact is a decision maker`
        : isSupportRole
        ? `Role '${lead.role}' appears to support a decision maker rather than be one`
        : `Role '${lead.role}' is not in target decision-maker roles (${icp.targetRoles.join(', ')})`,
    };

    if (rolePassed) {
      reasons.push(roleCheck.reason);
    } else {
      disqualificationReasons.push(roleCheck.reason);
    }

    const isQualified = industryPassed && sizePassed && countryPassed && rolePassed;

    return {
      isQualified,
      scoreAdjustment: isQualified ? 25 : 0,
      checks: {
        industryMatch: industryCheck,
        companySizeMatch: companySizeCheck,
        countryMatch: countryCheck,
        roleMatch: roleCheck,
      },
      reasons,
      disqualificationReasons,
    };
  }

  /**
   * Qualifies a lead in the database and updates statuses deterministically.
   */
  static async evaluateLead(leadId: string, customIcpId?: string) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { company: true },
    });

    if (!lead || !lead.company) {
      throw new Error(`Lead or associated company not found for id ${leadId}`);
    }

    const icp = customIcpId
      ? await prisma.icpProfile.findUnique({ where: { id: customIcpId } })
      : await IcpService.getActiveIcp(lead.orgId || undefined);

    if (!icp) {
      throw new Error('No active ICP Profile configured.');
    }

    const result = this.qualify(
      {
        industry: lead.company.industry || lead.industry,
        employeeCount: lead.company.employeeCount,
        country: lead.company.country,
      },
      {
        role: lead.role || lead.contactRole,
        fullName: lead.fullName || lead.contactName,
      },
      icp
    );

    const newStatus = result.isQualified ? 'QUALIFIED' : 'DISQUALIFIED';
    const disqualificationReason = result.isQualified ? null : result.disqualificationReasons.join('; ');

    // Update Company status if it was in candidate state
    if (lead.company.status === 'CANDIDATE') {
      await prisma.company.update({
        where: { id: lead.company.id },
        data: {
          status: result.isQualified ? 'QUALIFIED' : 'DISQUALIFIED',
          disqualificationReason,
        },
      });
    }

    // Update Lead status
    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: newStatus,
        disqualificationReason,
      },
    });

    logger.info(`⚖️ Evaluated Lead ${lead.fullName} (${lead.companyName}): ${newStatus}. Passed checks: ${result.reasons.length}`);
    return { lead: updatedLead, qualification: result };
  }
}
