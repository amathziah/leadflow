import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Get all competitor profiles with optional filters
 */
export const getCompetitors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { search, industry, page = '1', limit = '50' } = req.query;

    const parsedPage = Math.max(1, parseInt(page as string, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (parsedPage - 1) * parsedLimit;

    const where: any = {};

    if (industry) {
      where.industry = { contains: industry as string, mode: 'insensitive' };
    }

    if (search) {
      where.OR = [
        { companyName: { contains: search as string, mode: 'insensitive' } },
        { competitiveMoats: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [total, competitors] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        skip,
        take: parsedLimit,
        orderBy: { leadScore: 'desc' },
        include: { workflow: { select: { id: true, query: true, targetVertical: true } } },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: competitors,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single competitor profile by ID
 */
export const getCompetitorById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) throw new BadRequestError('Competitor ID is required');

    const competitor = await prisma.lead.findUnique({
      where: { id },
      include: { workflow: true },
    });

    if (!competitor) throw new NotFoundError(`Competitor with ID "${id}" not found`);

    res.status(200).json({ success: true, data: competitor });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a competitor profile
 */
export const deleteCompetitor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) throw new BadRequestError('Competitor ID is required');

    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Competitor with ID "${id}" not found`);

    await prisma.lead.delete({ where: { id } });
    logger.info(`Competitor profile "${id}" deleted`);

    res.status(200).json({ success: true, message: 'Competitor profile deleted successfully' });
  } catch (error) {
    next(error);
  }
};
