import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { LeadStatus } from '@prisma/client';
import logger from '../utils/logger.js';

export const getLeads = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, industry, search, page = '1', limit = '10' } = req.query;
    
    const parsedPage = parseInt(page as string, 10);
    const parsedLimit = parseInt(limit as string, 10);
    
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new BadRequestError('Invalid page parameter');
    }
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestError('Invalid limit parameter (must be between 1 and 100)');
    }

    const skip = (parsedPage - 1) * parsedLimit;

    // Build filters
    const where: any = {};
    
    if (status) {
      if (!Object.values(LeadStatus).includes(status as any)) {
        throw new BadRequestError(`Invalid status filter. Allowed values: ${Object.values(LeadStatus).join(', ')}`);
      }
      where.status = status as LeadStatus;
    }

    if (industry) {
      where.industry = {
        contains: industry as string,
        mode: 'insensitive',
      };
    }

    if (search) {
      where.OR = [
        { companyName: { contains: search as string, mode: 'insensitive' } },
        { contactName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    // Execute queries in parallel
    const [leads, totalCount] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: parsedLimit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.lead.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: leads,
      pagination: {
        total: totalCount,
        page: parsedPage,
        limit: parsedLimit,
        pages: Math.ceil(totalCount / parsedLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLeadById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!id) {
      throw new BadRequestError('Lead ID parameter is required');
    }

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: { workflow: true },
    });

    if (!lead) {
      throw new NotFoundError(`Lead with ID "${id}" not found`);
    }

    res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    next(error);
  }
};

export const updateLead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { companyName, website, contactName, email, industry, leadScore, status, outreachMessage, metadata } = req.body;

    if (!id) {
      throw new BadRequestError('Lead ID parameter is required');
    }

    // Check if lead exists
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Lead with ID "${id}" not found`);
    }

    // Validate status if changing
    if (status && !Object.values(LeadStatus).includes(status as any)) {
      throw new BadRequestError(`Invalid status. Allowed values: ${Object.values(LeadStatus).join(', ')}`);
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        companyName: companyName ?? undefined,
        website: website ?? undefined,
        contactName: contactName ?? undefined,
        email: email ?? undefined,
        industry: industry ?? undefined,
        leadScore: leadScore !== undefined ? leadScore : undefined,
        status: (status as LeadStatus) ?? undefined,
        outreachMessage: outreachMessage ?? undefined,
        metadata: metadata !== undefined ? metadata : undefined,
      },
    });

    logger.info(`Lead "${id}" updated successfully by client`);

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteLead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new BadRequestError('Lead ID parameter is required');
    }

    // Check if lead exists
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Lead with ID "${id}" not found`);
    }

    await prisma.lead.delete({ where: { id } });
    logger.info(`Lead "${id}" deleted successfully`);

    res.status(200).json({
      success: true,
      message: 'Lead deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
