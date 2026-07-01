import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(startTime);
    const timeInMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
    
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${timeInMs}ms`;
    
    const logDetails = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: parseFloat(timeInMs),
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    };

    if (res.statusCode >= 500) {
      logger.error(message, logDetails);
    } else if (res.statusCode >= 400) {
      logger.warn(message, logDetails);
    } else {
      logger.info(message, logDetails);
    }
  });

  next();
};
