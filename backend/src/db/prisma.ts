import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

// Extend global type to prevent multiple Prisma client instances during hot reloading in dev
declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('🚀 Database connected successfully through Prisma ORM');
  } catch (error: any) {
    logger.warn(`⚠️ Database connection warning (offline or network issue): ${error.message}`);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('🔌 Database disconnected cleanly');
  } catch (error: any) {
    logger.error('❌ Error while disconnecting from the database:', error);
  }
};
