import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import logger from './utils/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { connectDatabase, disconnectDatabase } from './db/prisma.js';
import supabaseStorage from './services/supabaseStorage.js';
import apiRouter from './routes/index.js';

const app = express();

// 1. Security & Body Parsing Middleware
app.use(helmet());
app.use(cors({
  origin: env.NODE_ENV === 'development' ? '*' : false, // In production, replace with dashboard host
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Request Telemetry Middleware
app.use(requestLogger);

// 3. API Routers
app.use('/api', apiRouter);

// Root level health shortcut
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'leadflow-backend',
  });
});

// 4. Fallback 404 Route handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'API route not found',
      statusCode: 404,
    },
  });
});

// 5. Global Error Handler Middleware
app.use(errorHandler);

// Server lifecycle manager
let server: any;

const bootstrap = async () => {
  try {
    logger.info('Starting LeadFlow AI Backend Engine...');
    
    // Connect database
    await connectDatabase();

    // Verify storage buckets asynchronously (won't block server startup)
    supabaseStorage.ensureBucketExists(env.SUPABASE_SCREENSHOTS_BUCKET, false).catch((err) => {
      logger.warn(`Screenshot bucket initialization check finished with alert: ${err.message}`);
    });
    supabaseStorage.ensureBucketExists(env.SUPABASE_LOGS_BUCKET, false).catch((err) => {
      logger.warn(`Logs bucket initialization check finished with alert: ${err.message}`);
    });

    // Start Express listener
    const port = env.PORT;
    server = app.listen(port, () => {
      logger.info(`⚡ [Server] Running in ${env.NODE_ENV} mode on port ${port}`);
    });
  } catch (error) {
    logger.error('💥 Critical error during server bootstrap:', error);
    process.exit(1);
  }
};

// Handle uncaught telemetry events
process.on('uncaughtException', (error) => {
  try {
    logger.error('CRITICAL: Uncaught Exception detected:', error);
  } catch (e) {
    // Prevent crash loop if writing to stdout/stderr fails
  }
  gracefulShutdown(1);
});

process.on('unhandledRejection', (reason, promise) => {
  try {
    logger.error('CRITICAL: Unhandled Promise Rejection detected:', { reason, promise });
  } catch (e) {
    // Prevent crash loop if writing to stdout/stderr fails
  }
  gracefulShutdown(1);
});

// Graceful exit coordinator
const gracefulShutdown = async (exitCode = 0) => {
  try {
    logger.info('🔌 Initiating graceful server termination...');
  } catch (e) {}
  
  if (server) {
    server.close(() => {
      try {
        logger.info('HTTP server listener closed.');
      } catch (e) {}
    });
  }

  // Disconnect database client
  await disconnectDatabase();
  
  try {
    logger.info('Graceful shutdown procedure complete.');
  } catch (e) {}
  process.exit(exitCode);
};

// POSIX Signals
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal.');
  gracefulShutdown(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT signal.');
  gracefulShutdown(0);
});

// Initialize server
bootstrap();
