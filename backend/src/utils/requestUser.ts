import type { Request } from 'express';

/**
 * The signed-in user of a request. authMiddleware sets `req.user` before any protected
 * handler runs, so a missing one means the route was mounted without it: fail loudly
 * instead of reading a field of undefined.
 */
export const currentUser = (req: Request): Express.AuthenticatedUser => {
  if (!req.user) throw new Error('No authenticated user on the request (is authMiddleware missing?)');
  return req.user;
};
