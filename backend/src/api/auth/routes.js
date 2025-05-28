const express = require('express');
const { authenticateUser } = require('../../services/authService');
const router = express.Router();

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and get token
 * @access Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide email and password' 
      });
    }
    
    // Authenticate user
    const result = await authenticateUser(email, password);
    
    if (!result.success) {
      return res.status(401).json({ 
        success: false, 
        message: result.message 
      });
    }
    
    // Return user and token
    res.status(200).json({
      success: true,
      user: result.user,
      token: result.token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during authentication' 
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user (client-side only, invalidate token on client)
 * @access Public
 */
router.post('/logout', (req, res) => {
  // JWT is stateless, so logout is handled client-side
  // This endpoint exists for consistency and future extensions
  res.status(200).json({ 
    success: true, 
    message: 'Logout successful' 
  });
});

/**
 * @route GET /api/auth/me
 * @desc Get current user info
 * @access Private (will be protected by auth middleware)
 */
router.get('/me', (req, res) => {
  // This will be protected by auth middleware
  // For now, just return a placeholder
  res.status(200).json({ 
    success: true, 
    message: 'Protected route - will return user info when auth middleware is implemented' 
  });
});

module.exports = router;
