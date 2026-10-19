const db = require("../../config/db");

/**
 * ============================================================
 * SCAN MEMBER QR
 * POST /api/gate/scan
 * body: { qrToken }
 * ============================================================
 *
 * Toggle logic:
 *   - if member is OUT  -> mark IN  (direction: 'in')
 *   - if member is IN   -> mark OUT (direction: 'out')
 *
 * Every scan is logged with a timestamp for full attendance history.
 */
exports.scanMember = async (req, res) => {
  try {
    const { qrToken } = req.body;
    const scannedBy = req.user?.id || null;

    if (!qrToken || typeof qrToken !== "string") {
      return res.status(400).json({
        success: false,
        message: "QR token is required",
      });
    }

    /* ---------- 1. Look up the member by QR token ---------- */
    const memberRes = await db.query(
      `SELECT
         m.id,
         m.user_id,
         m.member_code,
         m.qr_token,
         m.tier,
         m.reward_points,
         m.matches_attended,
         m.total_visits,
         m.is_inside,
         m.last_scan_at,
         u.full_name,
         u.email,
         u.avatar_url,
         u.is_active
       FROM public.members m
       JOIN public.users u ON u.id = m.user_id
       WHERE m.qr_token = $1
       LIMIT 1`,
      [qrToken]
    );

    if (memberRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Invalid QR code — no member found",
      });
    }

    const member = memberRes.rows[0];

    if (!member.is_active) {
      return res.status(403).json({
        success: false,
        message: "Account is disabled",
      });
    }

    /* ---------- 2. Determine direction (toggle) ---------- */
    const newDirection = member.is_inside ? "out" : "in";
    const newIsInside  = !member.is_inside;

    /* ---------- 3. Update the member ---------- */
    const updateRes = await db.query(
      `UPDATE public.members
       SET is_inside     = $1,
           last_scan_at  = NOW(),
           total_visits  = CASE WHEN $2 = 'in' AND $3 = false THEN total_visits + 1 ELSE total_visits END,
           matches_attended = CASE WHEN $2 = 'in' AND $3 = false THEN matches_attended + 1 ELSE matches_attended END,
           reward_points = CASE WHEN $2 = 'in' AND $3 = false THEN reward_points + 10 ELSE reward_points END,
           updated_at    = NOW()
       WHERE id = $4
       RETURNING is_inside, last_scan_at, total_visits, matches_attended, reward_points`,
      [newIsInside, newDirection, member.is_inside, member.id]
    );

    const updated = updateRes.rows[0];

    /* ---------- 4. Log the scan ---------- */
    await db.query(
      `INSERT INTO public.gate_scans
         (member_id, direction, scanned_by, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [
        member.id,
        newDirection,
        scannedBy,
        req.ip || req.connection?.remoteAddress || null,
      ]
    );

    /* ---------- 5. Respond ---------- */
    return res.json({
      success: true,
      message: newDirection === "in"
        ? `Welcome, ${member.full_name.split(" ")[0]}! ✅`
        : `Goodbye, ${member.full_name.split(" ")[0]}! 👋`,
      data: {
        member: {
          id: member.id,
          member_code: member.member_code,
          full_name: member.full_name,
          email: member.email,
          tier: member.tier,
          avatar_url: member.avatar_url,
        },
        direction: newDirection,        // 'in' or 'out'
        is_inside: updated.is_inside,
        total_visits: updated.total_visits,
        matches_attended: updated.matches_attended,
        reward_points: updated.reward_points,
        scanned_at: updated.last_scan_at,
      },
    });

  } catch (error) {
    console.error("❌ Gate Scan Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


/**
 * ============================================================
 * MEMBER STATUS — quick lookup
 * GET /api/gate/member/:qrToken
 * ============================================================
 * Returns the current status of a member without marking them in/out.
 * Useful for admin preview before confirming the scan.
 */
exports.memberStatus = async (req, res) => {
  try {
    const { qrToken } = req.params;

    const result = await db.query(
      `SELECT
         m.id,
         m.member_code,
         m.tier,
         m.total_visits,
         m.matches_attended,
         m.is_inside,
         m.last_scan_at,
         u.full_name,
         u.email,
         u.avatar_url,
         u.is_active
       FROM public.members m
       JOIN public.users u ON u.id = m.user_id
       WHERE m.qr_token = $1
       LIMIT 1`,
      [qrToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    const m = result.rows[0];

    return res.json({
      success: true,
      data: {
        member: {
          id: m.id,
          member_code: m.member_code,
          full_name: m.full_name,
          email: m.email,
          tier: m.tier,
          avatar_url: m.avatar_url,
          is_active: m.is_active,
        },
        status: {
          is_inside: m.is_inside,
          total_visits: m.total_visits,
          matches_attended: m.matches_attended,
          last_scan_at: m.last_scan_at,
        },
      },
    });

  } catch (error) {
    console.error("❌ Member Status Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


/**
 * ============================================================
 * RECENT SCANS — for admin dashboard
 * GET /api/gate/recent?limit=50
 * ============================================================
 */
exports.recentScans = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const result = await db.query(
      `SELECT
         gs.id,
         gs.direction,
         gs.scanned_at,
         m.member_code,
         u.full_name,
         u.email
       FROM public.gate_scans gs
       JOIN public.members m ON m.id = gs.member_id
       JOIN public.users u ON u.id = m.user_id
       ORDER BY gs.scanned_at DESC
       LIMIT $1`,
      [limit]
    );

    return res.json({
      success: true,
      data: result.rows,
    });

  } catch (error) {
    console.error("❌ Recent Scans Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


/**
 * ============================================================
 * INSIDE COUNT — how many members currently at the venue
 * GET /api/gate/inside-count
 * ============================================================
 */
exports.insideCount = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*)::int AS inside
       FROM public.members
       WHERE is_inside = true`
    );

    return res.json({
      success: true,
      data: {
        inside: result.rows[0].inside,
      },
    });

  } catch (error) {
    console.error("❌ Inside Count Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};