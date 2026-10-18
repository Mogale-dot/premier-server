const db = require("../../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { signAccessToken, signRefreshToken } = require("../../utils/jwt");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_EXPIRES || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_EXPIRES || "7d";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


// ============================================================
// HELPERS
// ============================================================
function generateTokens(user) {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.full_name,
    role: user.role,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return { accessToken, refreshToken };
}

async function generateMemberCode() {
  const year = new Date().getFullYear();
  const result = await db.query(
    `SELECT COUNT(*)::int AS count FROM public.members WHERE member_code LIKE $1`,
    [`PCL-${year}-%`]
  );
  const next = (result.rows[0].count || 0) + 1;
  return `PCL-${year}-${String(next).padStart(4, "0")}`;
}

async function storeRefreshToken(userId, refreshToken) {
  try {
    const result = await db.query(
      `UPDATE public.users
       SET refresh_token = $1, updated_at = NOW()
       WHERE id = $2`,
      [refreshToken, userId]
    );
    if (result.rowCount === 0) {
      console.warn(`⚠️ User ${userId} not found when updating refresh token`);
    }
  } catch (error) {
    console.error("❌ Error storing refresh token:", error.message);
  }
}


// ============================================================
// SIGNUP
// POST /api/auth/signup
// body: { email, password, full_name }
// ============================================================
exports.signup = async (req, res) => {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({
        success: false,
        message: "Email, password and full name are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existing = await db.query(
      `SELECT id FROM public.users WHERE email = $1`,
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with that email already exists",
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const userResult = await db.query(
      `INSERT INTO public.users (email, full_name, role, password_hash, auth_provider)
       VALUES ($1, $2, 'member', $3, 'email')
       RETURNING id, email, full_name, role, created_at`,
      [email.toLowerCase(), full_name, password_hash]
    );

    const user = userResult.rows[0];

    const memberCode = await generateMemberCode();
    await db.query(
      `INSERT INTO public.members (user_id, member_code)
       VALUES ($1, $2)`,
      [user.id, memberCode]
    );

    const { accessToken, refreshToken } = generateTokens(user);

    await storeRefreshToken(user.id, refreshToken);

    return res.status(201).json({
      success: true,
      message: "Account created",
      data: {
        user,
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("❌ Signup Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


// ============================================================
// LOGIN
// POST /api/auth/login
// body: { email, password }
// ============================================================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const result = await db.query(
      `SELECT id, email, full_name,role, password_hash, is_active, avatar_url
       FROM public.users
       WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Account is disabled. Please contact support.",
      });
    }

    if (!user.password_hash) {
      return res.status(401).json({
        success: false,
        message: "This account uses Google sign-in. Please continue with Google.",
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    delete user.password_hash;

    const { accessToken, refreshToken } = generateTokens(user);

    await storeRefreshToken(user.id, refreshToken);

    return res.json({
      success: true,
      message: "Login successful",
      data: {
        user,
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("❌ Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


// ============================================================
// GOOGLE AUTH
// POST /api/auth/google
// body: { idToken }
// ============================================================
exports.googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google token required",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        success: false,
        message: "Invalid Google token",
      });
    }

    const { sub, email, name, picture, email_verified } = payload;

    if (!sub || !email || !email_verified) {
      return res.status(401).json({
        success: false,
        message: "Google account not verified",
      });
    }

    let userResult = await db.query(
      `SELECT id, email, full_name, phone, role, avatar_url, is_active
       FROM public.users
       WHERE google_id = $1 OR email = $2
       LIMIT 1`,
      [sub, email.toLowerCase()]
    );

    let user;

    if (!userResult.rows.length) {
      const newUserRes = await db.query(
        `INSERT INTO public.users
           (email, full_name, role, google_id, auth_provider, avatar_url)
         VALUES ($1, $2, 'member', $3, 'google', $4)
         RETURNING id, email, full_name, phone, role, avatar_url`,
        [
          email.toLowerCase(),
          name || email.split("@")[0],
          sub,
          picture || null,
        ]
      );

      user = newUserRes.rows[0];

      const memberCode = await generateMemberCode();
      await db.query(
        `INSERT INTO public.members (user_id, member_code)
         VALUES ($1, $2)`,
        [user.id, memberCode]
      );

      console.log("✅ New Google user created:", user.email);
    } else {
      user = userResult.rows[0];

      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: "Account is disabled. Please contact support.",
        });
      }

      await db.query(
        `UPDATE public.users
         SET google_id = COALESCE(google_id, $1),
             auth_provider = CASE WHEN auth_provider = 'email' THEN 'google' ELSE auth_provider END,
             updated_at = NOW()
         WHERE id = $2`,
        [sub, user.id]
      );

      if (user.role === "member") {
        const m = await db.query(
          `SELECT id FROM public.members WHERE user_id = $1 LIMIT 1`,
          [user.id]
        );
        if (!m.rows.length) {
          const memberCode = await generateMemberCode();
          await db.query(
            `INSERT INTO public.members (user_id, member_code)
             VALUES ($1, $2)`,
            [user.id, memberCode]
          );
        }
      }

      console.log("✅ Google user login:", user.email);
    }

    const { accessToken, refreshToken } = generateTokens(user);

    storeRefreshToken(user.id, refreshToken).catch((err) => {
      console.error("❌ Background refresh token storage failed:", err.message);
    });

    return res.status(200).json({
      success: true,
      message: "Google authentication successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          avatar_url: user.avatar_url,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    console.error("❌ Google auth error:", err);

    if (err.code === "57014") {
      console.error("Database timeout - check your PostgreSQL configuration");
    }

    return res.status(500).json({
      success: false,
      message: "Google authentication failed",
    });
  }
};


// ============================================================
// REFRESH
// POST /api/auth/refresh
// body: { refreshToken }
// ============================================================
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    const result = await db.query(
      `SELECT id, email, full_name, role, refresh_token
       FROM public.users
       WHERE id = $1 AND refresh_token = $2`,
      [decoded.id, refreshToken]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    const user = result.rows[0];
    const tokens = generateTokens(user);

    await storeRefreshToken(user.id, tokens.refreshToken);

    return res.json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    console.error("❌ Refresh Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


// ============================================================
// LOGOUT
// POST /api/auth/logout
// ============================================================
exports.logout = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    await db.query(
      `UPDATE public.users SET refresh_token = NULL, updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    return res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("❌ Logout Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


// ============================================================
// GET ME
// GET /api/auth/me
// ============================================================
exports.getMe = async (req, res) => {
  try {
    const userId = req.user?.id;

    const result = await db.query(
      `SELECT id, email, full_name,  role, avatar_url, is_active, created_at
       FROM public.users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    if (user.role === "member") {
      const m = await db.query(
        `SELECT member_code, qr_token, tier, reward_points, matches_attended, joined_at
         FROM public.members WHERE user_id = $1`,
        [userId]
      );
      if (m.rows.length > 0) user.member = m.rows[0];
    }

    if (user.role === "captain") {
      const t = await db.query(
        `SELECT id, name, slug, logo_url FROM public.teams WHERE captain_id = $1 LIMIT 1`,
        [userId]
      );
      if (t.rows.length > 0) user.team = t.rows[0];
    }

    return res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("❌ GetMe Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


// ============================================================
// CHANGE PASSWORD
// POST /api/auth/change-password
// body: { currentPassword, newPassword }
// ============================================================
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    const result = await db.query(
      `SELECT password_hash FROM public.users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!result.rows[0].password_hash) {
      return res.status(400).json({
        success: false,
        message: "This account uses Google sign-in and has no password.",
      });
    }

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await db.query(
      `UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("❌ Change Password Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};