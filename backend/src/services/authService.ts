import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { User } from '../models/User';
import { createError } from '../middleware/errorHandler';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'development_secret';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '1d') as SignOptions['expiresIn'];

interface ITokenPayload {
  userId: string;
  email: string;
  role: string;
}

export class AuthService {
  static async register(
    email: string,
    password: string,
    role: 'admin' | 'user' = 'user',
  ): Promise<{ user: User; token: string }> {
    try {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        throw createError('Email already registered', 400);
      }

      const user = await User.create({
        email,
        password,
        role,
      });

      // Generate token
      const token = this.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return { user, token };
    } catch (error) {
      throw error;
    }
  }

  static async login(email: string, password: string): Promise<{ user: User; token: string }> {
    try {
      const user = await User.unscoped().findOne({ where: { email } });
      if (!user) {
        throw createError('Invalid credentials', 401);
      }

      if (!user.isActive) {
        throw createError('Account is disabled', 401);
      }

      const isValidPassword = await user.verifyPassword(password);
      if (!isValidPassword) {
        // Increment failed login attempts
        await user.increment('failedLoginAttempts');

        // Lock account after 5 failed attempts
        if (user.failedLoginAttempts >= 4) {
          await user.update({ isActive: false });
          throw createError('Account locked due to too many failed attempts', 401);
        }

        throw createError('Invalid credentials', 401);
      }

      // Reset failed login attempts and update last login
      await user.update({
        failedLoginAttempts: 0,
        lastLogin: new Date(),
      });

      // Generate token
      const token = this.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return { user, token };
    } catch (error) {
      throw error;
    }
  }

  private static generateToken(payload: ITokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
  }

  static verifyToken(token: string): ITokenPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as ITokenPayload;
    } catch (error) {
      throw createError('Invalid or expired token', 401);
    }
  }
}
