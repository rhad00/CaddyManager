import { Request, Response, NextFunction } from 'express';
import { createError } from './errorHandler';

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  next(createError(`Route not found: ${req.originalUrl}`, 404));
};
