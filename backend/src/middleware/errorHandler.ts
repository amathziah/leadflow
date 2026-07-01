import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let isOperational = false;
  let stack = err.stack;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  }

  // Log the error depending on its operational status
  if (isOperational) {
    logger.warn(`Operational Error: ${statusCode} - ${message} | Route: ${req.method} ${req.originalUrl}`);
  } else {
    logger.error(`Critical/Unhandled System Error: ${err.message}`, {
      stack: err.stack,
      route: `${req.method} ${req.originalUrl}`,
      body: req.body,
      query: req.query,
    });
  }

  const responsePayload: Record<string, any> = {
    success: false,
    error: {
      message,
      statusCode,
      ...(env.NODE_ENV === 'development' ? { stack } : {}),
    },
  };

  res.status(statusCode).json(responsePayload);
};
