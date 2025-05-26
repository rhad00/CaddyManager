import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
  validationErrors?: Array<{ field: string; message: string }>;
}

export const errorHandler = (err: AppError, req: Request, res: Response, next: NextFunction) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
      validationErrors: err.validationErrors,
    });
  } else {
    // Production error response
    const response: {
      status: string;
      message: string;
      validationErrors?: Array<{ field: string; message: string }>;
    } = {
      status: err.status,
      message: err.isOperational ? err.message : 'Internal server error',
    };

    if (err.validationErrors) {
      response.validationErrors = err.validationErrors;
    }

    res.status(err.statusCode).json(response);
  }
};

export const createError = (
  message: string,
  statusCode: number = 500,
  validationErrors?: Array<{ field: string; message: string }>,
  isOperational: boolean = true,
): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
  error.isOperational = isOperational;
  if (validationErrors) {
    error.validationErrors = validationErrors;
  }
  return error;
};
