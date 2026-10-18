// ============================================
// LOVE.MIDDLEWARE.JS
// Simple token verification for protected routes
// ============================================

/**
 * Verify Love Token
 * Checks if the request has a valid love token in headers
 */
function verifyLoveToken(req, res, next) {
  const token = req.headers['x-love-token'] || req.headers['authorization'];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'no_token',
      message: 'This is our secret place. No entry without the key 🔐'
    });
  }

  // Clean token (remove 'Bearer ' if present)
  const cleanToken = token.replace('Bearer ', '');

  try {
    // Decode and validate token
    const decoded = Buffer.from(cleanToken, 'base64').toString('utf-8');

    if (!decoded.startsWith('love-')) {
      throw new Error('Invalid token format');
    }

    // Extract email from token
    const parts = decoded.split('-');
    if (parts.length < 3) {
      throw new Error('Invalid token structure');
    }

    // Token is valid - attach user info
    req.loveUser = {
      email: parts[1],
      loginTime: parseInt(parts[2])
    };

    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(401).json({
      success: false,
      error: 'invalid_token',
      message: 'That key doesn\'t work anymore, beautiful. Please login again 💕'
    });
  }
}

module.exports = { verifyLoveToken };