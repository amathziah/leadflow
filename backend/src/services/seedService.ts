import { prisma } from '../db/prisma.js';
import logger from '../utils/logger.js';

export interface DefaultContext {
  organizationId: string;
  userId: string;
  icpProfileId: string;
}

let cachedContext: DefaultContext | null = null;

/**
 * Ensures a minimal production context exists for single-tenant deployments.
 * The org/user/ICP are created from environment variables or sensible defaults —
 * no demo or fake data is ever seeded.
 *
 * For multi-tenant setups, this should be replaced by a proper auth/onboarding flow.
 */
export async function getOrCreateDefaultContext(): Promise<DefaultContext> {
  if (cachedContext) {
    return cachedContext;
  }

  const orgName = process.env.DEFAULT_ORG_NAME || 'LeadFlow Organization';
  const orgDomain = process.env.DEFAULT_ORG_DOMAIN || 'leadflow.ai';
  const userEmail = process.env.DEFAULT_USER_EMAIL || 'admin@leadflow.ai';
  const userName = process.env.DEFAULT_USER_NAME || 'Admin User';

  // 1. Get or create Organization
  let org = await prisma.organization.findFirst({
    where: { domain: orgDomain },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: orgName,
        domain: orgDomain,
        plan: 'ENTERPRISE',
        settings: {
          defaultModel: 'gemini-2.0-flash',
          scoringThreshold: 70,
          currency: 'USD',
        },
      },
    });
    logger.info(`🏢 Created organization: ${org.name} (${org.id})`);
  }

  // 2. Get or create Admin User
  let user = await prisma.user.findFirst({
    where: { orgId: org.id },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        orgId: org.id,
        email: userEmail,
        name: userName,
        role: 'SALES_MANAGER',
      },
    });
    logger.info(`👤 Created admin user: ${user.name} (${user.id})`);
  }

  // 3. Get or create a default ICP Profile if none exists
  let icp = await prisma.icpProfile.findFirst({
    where: { orgId: org.id, isActive: true },
  });

  if (!icp) {
    icp = await prisma.icpProfile.create({
      data: {
        orgId: org.id,
        name: 'Default ICP Profile',
        description: 'Default profile — update this in ICP Studio to match your actual Ideal Customer Profile.',
        targetIndustries: ['B2B SaaS', 'Software', 'FinTech', 'Cloud Infrastructure'],
        minEmployees: 50,
        maxEmployees: 1000,
        targetCountries: ['US', 'United States', 'UK', 'United Kingdom', 'Canada', 'Australia'],
        targetRoles: ['CFO', 'VP Finance', 'CEO', 'Founder', 'VP Sales', 'Head of Growth'],
        requiredTechnologies: [],
        targetSignals: ['HIRING_GROWTH', 'FUNDING_ROUND', 'GEO_EXPANSION', 'LEADERSHIP_CHANGE'],
        minScoreThreshold: 70,
        isActive: true,
      },
    });
    logger.info(`🎯 Created default ICP profile: ${icp.name} (${icp.id})`);
  }

  cachedContext = {
    organizationId: org.id,
    userId: user.id,
    icpProfileId: icp.id,
  };

  return cachedContext;
}
