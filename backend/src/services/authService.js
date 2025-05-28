const jwt = require('jsonwebtoken');
const User = require('../models/user');
require('dotenv').config();

// JWT secret key from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-for-development-only';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object
 * @returns {String} JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id,
      email: user.email,
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION }
  );
};

/**
 * Verify a JWT token
 * @param {String} token - JWT token
 * @returns {Object|null} Decoded token payload or null if invalid
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
};

/**
 * Authenticate a user with email and password
 * @param {String} email - User email
 * @param {String} password - User password
 * @returns {Object} Object containing user and token if authentication successful
 */
const authenticateUser = async (email, password) => {
  try {
    // Find user by email
    const user = await User.findOne({ where: { email } });
    
    // Check if user exists
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    
    // Check if account is locked
    if (user.status === 'locked') {
      return { success: false, message: 'Account is locked' };
    }
    
    // Check password
    const isPasswordValid = await user.checkPassword(password);
    
    if (!isPasswordValid) {
      // Increment failed login attempts
      user.failed_login_attempts += 1;
      
      // Lock account after 5 failed attempts
      if (user.failed_login_attempts >= 5) {
        user.status = 'locked';
      }
      
      await user.save();
      
      return { success: false, message: 'Invalid password' };
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

module.exports = {
  generateToken,
  verifyToken,
  authenticateUser
};
