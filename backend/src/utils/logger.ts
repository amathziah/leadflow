import path from 'path';
import winston from 'winston';
import { env } from '../config/env.js';

const logFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    // Avoid double logging large objects or internal metadata structures
    const cleanMeta = { ...metadata };
    delete cleanMeta.service;
    if (Object.keys(cleanMeta).length > 0) {
      msg += ` ${JSON.stringify(cleanMeta)}`;
    }
  }
  return msg;
});

const formats = [
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
];

const logger = winston.createLogger({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(...formats, winston.format.json()),
  defaultMeta: { service: 'leadflow-backend' },
  transports: [
    // Output error logs to local file
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // Output all logs to local file
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});

// If in development mode, log to console with custom colorized formats
if (env.NODE_ENV === 'development') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        logFormat
      ),
    })
  );
} else {
  // Production console transport uses JSON
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

export default logger;
