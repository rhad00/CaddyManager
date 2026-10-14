import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User } from '../models';

dotenv.config();

// JWT secret key from environment variables (REQUIRED - no fallback for security)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required. Set it to a strong random string.');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('WARNING: Using insecure default JWT secret for development only.');
  }
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';

/** What a login token carries */
export type TokenUser = Pick<User, 'id' | 'email' | 'role'>;

/**
 * Outcome of a login: a failure (`message`), a 2FA challenge (`require_2fa` and
 * `totp_session`) or a signed-in user with a `token`.
 */
export interface AuthResult {
  success: boolean;
  message?: string;
  require_2fa?: boolean;
  totp_session?: string;
  user?: { id: string; email: string; role: string; lastLogin: Date | null };
  token?: string;
}

/**
 * Generate a JWT token for a user
 * @param user - User object
 * @returns JWT token
 */
export const generateToken = (user: TokenUser): string => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    EFFECTIVE_JWT_SECRET,
    { expiresIn: JWT_EXPIRATION as jwt.SignOptions['expiresIn'] }
  );
};

/**
 * Generate a short-lived TOTP session token (5 min) used as a challenge ticket.
 */
export const generateTotpSession = (userId: string): string => {
  return jwt.sign({ sub: userId, purpose: 'totp_challenge' }, EFFECTIVE_JWT_SECRET, { expiresIn: '5m' });
};

/**
 * Verify a TOTP session token. Returns userId if valid, null otherwise.
 */
export const verifyTotpSession = (token: string): string | null => {
  try {
    const payload = jwt.verify(token, EFFECTIVE_JWT_SECRET) as jwt.JwtPayload;
    if (payload.purpose !== 'totp_challenge') return null;
    return payload.sub ?? null;
  } catch {
    return null;
  }
};

/**
 * Verify a JWT token
 * @param token - JWT token
 * @returns Decoded token payload or null if invalid
 */
export const verifyToken = (token: string): string | jwt.JwtPayload | null => {
  try {
    return jwt.verify(token, EFFECTIVE_JWT_SECRET);
  } catch (error) {
    console.error('Token verification failed:', error instanceof Error ? error.message : error);
    return null;
  }
};

/**
 * Authenticate a user with email and password
 * @param email - User email
 * @param password - User password
 * @returns the user and token if authentication succeeded, a 2FA challenge, or a failure
 */
export const authenticateUser = async (email: string, password: string): Promise<AuthResult> => {
  try {
    // Find user by email
    const user = await User.findOne({ where: { email } });

    // Check if user exists
    if (!user) {
      return { success: false, message: 'Invalid credentials' };
    }

    // Check if account is locked
    if (user.status === 'locked') {
      // Auto-unlock if lockout period has passed (30 minutes)
      if (user.lockout_until && new Date() > new Date(user.lockout_until)) {
        user.status = 'active';
        user.failed_login_attempts = 0;
        user.lockout_until = null;
        await user.save();
      } else {
        return { success: false, message: 'Account is locked. Please try again later.' };
      }
    }

    // Check password
    const isPasswordValid = await user.checkPassword(password);

    if (!isPasswordValid) {
      // Increment failed login attempts
      user.failed_login_attempts += 1;

      // Lock account after 5 failed attempts
      if (user.failed_login_attempts >= 5) {
        user.status = 'locked';
        user.lockout_until = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      }

      await user.save();

      return { success: false, message: 'Invalid credentials' };
    }

    // If 2FA is enabled, issue a challenge ticket instead of the full token
    if (user.totp_enabled) {
      // Reset failure counter but don't update last_login yet
      user.failed_login_attempts = 0;
      await user.save();
      const totpSession = generateTotpSession(user.id);
      return { success: true, require_2fa: true, totp_session: totpSession };
    }

    // Reset failed login attempts and update last login
    user.failed_login_attempts = 0;
    user.last_login = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        lastLogin: user.last_login
      },
      token
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, message: 'Authentication failed' };
  }
};
