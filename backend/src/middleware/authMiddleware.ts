import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { createError } from './errorHandler';
import { User } from '../models/User';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw createError('No token provided', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = AuthService.verifyToken(token);

    // Get user from database
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      throw createError('User not found', 401);
    }

    if (!user.isActive) {
      throw createError('Account is disabled', 401);
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw createError('Authentication required', 401);
      }

      if (!roles.includes(req.user.role)) {
        throw createError('Insufficient permissions', 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Admin role check middleware
export const requireAdmin = requireRole(['admin']);
