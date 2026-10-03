import { prisma } from '../db/prisma.js';
import { getOrCreateDefaultContext } from './seedService.js';
import logger from '../utils/logger.js';

export interface CreateIcpInput {
  name: string;
  description?: string;
  targetIndustries: string[];
  minEmployees: number;
  maxEmployees: number;
  targetCountries: string[];
  targetRoles: string[];
  requiredTechnologies?: string[];
  targetSignals?: string[];
  minScoreThreshold?: number;
}

export class IcpService {
  static async getActiveIcp(orgId?: string) {
    const context = await getOrCreateDefaultContext();
    const effectiveOrgId = orgId || context.organizationId;

    let icp = await prisma.icpProfile.findFirst({
      where: { orgId: effectiveOrgId, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!icp) {
      icp = await prisma.icpProfile.findUnique({
        where: { id: context.icpProfileId },
      });
    }

    return icp;
  }

  static async listIcps(orgId?: string) {
    const context = await getOrCreateDefaultContext();
    const effectiveOrgId = orgId || context.organizationId;

    return prisma.icpProfile.findMany({
      where: { orgId: effectiveOrgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async createIcp(input: CreateIcpInput, orgId?: string) {
    const context = await getOrCreateDefaultContext();
    const effectiveOrgId = orgId || context.organizationId;

    const icp = await prisma.icpProfile.create({
      data: {
        orgId: effectiveOrgId,
        name: input.name,
        description: input.description,
        targetIndustries: input.targetIndustries,
        minEmployees: input.minEmployees,
        maxEmployees: input.maxEmployees,
        targetCountries: input.targetCountries,
        targetRoles: input.targetRoles,
        requiredTechnologies: input.requiredTechnologies || [],
        targetSignals: input.targetSignals || [],
        minScoreThreshold: input.minScoreThreshold ?? 70,
        isActive: true,
      },
    });

    logger.info(`✅ Created ICP profile: ${icp.name}`);
    return icp;
  }

  static async updateIcp(id: string, input: Partial<CreateIcpInput> & { isActive?: boolean }) {
    const icp = await prisma.icpProfile.update({
      where: { id },
      data: {
        ...input,
        updatedAt: new Date(),
      },
    });

    logger.info(`🔄 Updated ICP profile: ${icp.name}`);
    return icp;
  }
}
