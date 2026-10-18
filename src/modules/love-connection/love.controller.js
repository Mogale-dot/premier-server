// ============================================
// LOVE.CONTROLLER.JS
// Handles login for your private website
// ============================================

/**
 * POST /api/love/login
 * Verify her credentials (stored in .env)
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // --- Validation ---
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields',
        message: 'Please fill in both fields'
      });
    }

    // --- Get credentials from .env (NEVER exposed to frontend) ---
    const HER_EMAIL = process.env.HER_EMAIL;
    const HER_PASSWORD = process.env.HER_PASSWORD;

    // Check if env variables are set
    if (!HER_EMAIL || !HER_PASSWORD) {
      console.error('❌ HER_EMAIL or HER_PASSWORD not set in .env');
      return res.status(500).json({
        success: false,
        error: 'server_config',
        message: 'your secret place needs some setup. Try again soon 💕'
      });
    }

    // --- Check credentials ---
    // Both wrong
    if (email !== HER_EMAIL && password !== HER_PASSWORD) {
      return res.status(401).json({
        success: false,
        error: 'wrong_both',
        message: 'Wrong email and password, my Lady. Try again? 💕'
      });
    }

    // Wrong email only
    if (email !== HER_EMAIL) {
      return res.status(401).json({
        success: false,
        error: 'wrong_email',
        message: "That email doesn't look familiar... Are you my girl? 👀"
      });
    }

    // Wrong password only
    if (password !== HER_PASSWORD) {
      return res.status(401).json({
        success: false,
        error: 'wrong_password',
        message: "Wrong password! Hint:.....  💕"
      });
    }

    // --- SUCCESS! ---
    console.log(`💕 She logged in! [${new Date().toLocaleString()}]`);

    // Generate a simple love token
    const loveToken = Buffer.from(
      `love-${email}-${Date.now()}`
    ).toString('base64');

    return res.status(200).json({
      success: true,
      message: 'Welcome, Beautiful! 💕',
      token: loveToken,
      user: {
        name: 'Beautiful',
        email: email
      }
    });

  } catch (err) {
    console.error('Love login error:', err);
    next(err);
  }
};

/**
 * GET /api/love/verify
 * Quick check if token is still valid
 */
exports.verifyToken = async (req, res, next) => {
  try {
    // If middleware passed, token is valid
    return res.status(200).json({
      success: true,
      message: 'Still your secret place 💕'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/love/heartbeat
 * Cute endpoint to check if server is alive
 */
exports.heartbeat = async (req, res) => {
  res.status(200).json({
    success: true,
    message: '💗',
    beating: true,
    timestamp: new Date().toISOString()
  });
};