import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import logger from './utils/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { connectDatabase, disconnectDatabase } from './db/prisma.js';
import path from 'path';
import apiRouter from './routes/index.js';

const app = express();

// 1. Security & Body Parsing
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: env.NODE_ENV === 'development' ? '*' : false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve local visual telemetry screenshots
app.use('/screenshots', express.static(path.join(process.cwd(), 'logs', 'screenshots')));

// 2. Request Telemetry
app.use(requestLogger);

// 3. API Routes
app.use('/api', apiRouter);

// Health shortcut
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'leadflow-backend',
  });
});

// 4. 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { message: 'API route not found', statusCode: 404 } });
});

// 5. Global Error Handler
app.use(errorHandler);

let server: any;

const bootstrap = async () => {
  try {
    logger.info('🚀 Starting LeadFlow AI Backend...');
    await connectDatabase();

    // Initialize Default Context & Seed Profile if needed
    const { getOrCreateDefaultContext } = await import('./services/seedService.js');
    await getOrCreateDefaultContext();

    // Start Asynchronous Queue Worker
    const { QueueService } = await import('./services/queueService.js');
    QueueService.startWorker();

    const port = env.PORT;
    server = app.listen(port, () => {
      logger.info(`⚡ [Server] Running in ${env.NODE_ENV} mode on port ${port}`);
      logger.info(`🧠 LeadFlow AI Intelligence Engine ready on http://localhost:${port}`);
    });
  } catch (error) {
    logger.error('💥 Critical error during server bootstrap:', error);
    process.exit(1);
  }
};

process.on('uncaughtException', (error) => {
  logger.error('CRITICAL: Uncaught Exception:', error);
  gracefulShutdown(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('CRITICAL: Unhandled Rejection:', { reason });
  gracefulShutdown(1);
});

const gracefulShutdown = async (exitCode = 0) => {
  logger.info('🔌 Initiating graceful shutdown...');
  const { QueueService } = await import('./services/queueService.js');
  QueueService.stopWorker();
  if (server) server.close(() => logger.info('HTTP server closed.'));
  await disconnectDatabase();
  logger.info('Shutdown complete.');
  process.exit(exitCode);
};

process.on('SIGTERM', () => { logger.info('SIGTERM received.'); gracefulShutdown(0); });
process.on('SIGINT', () => { logger.info('SIGINT received.'); gracefulShutdown(0); });

bootstrap();
