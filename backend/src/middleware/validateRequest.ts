import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

/** One rejected field, shaped like an express-validator error (minus the value: it may be a secret) */
export interface ValidationIssue {
  type: 'field';
  msg: string;
  path: string;
  location: 'body';
}

/**
 * Validate and normalise a JSON request body with a zod schema.
 *
 * On success `req.body` becomes the parsed data (trimmed, coerced, defaulted, with fields the
 * schema does not name dropped), so a handler only ever sees what the schema allows. On failure
 * the request gets the same 400 envelope as the express-validator rules in ./validation.
 */
export const validateBody = (schema: ZodType): RequestHandler =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (result.success) {
      req.body = result.data;
      next();
      return;
    }
    const errors: ValidationIssue[] = result.error.issues.map((issue) => ({
      type: 'field',
      msg: issue.message,
      path: issue.path.map(String).join('.'),
      location: 'body',
    }));
    res.status(400).json({ success: false, message: 'Validation error', errors });
  };
