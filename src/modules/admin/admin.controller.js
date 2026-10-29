const db = require("../../config/db");

exports.getDashboardStats = async (req, res) => {
  try {
    /* =========================================================
       STATS — one fast query
       ========================================================= */
    const statsRes = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM public.team_registrations WHERE status = 'pending')::int AS pending_teams,
        (SELECT COUNT(*) FROM public.teams)::int                                        AS active_teams,
        (SELECT COUNT(*) FROM public.players)::int                                      AS registered_players,
        (SELECT COUNT(*) FROM public.matches)::int                                      AS scheduled_fixtures,
        (SELECT COUNT(*) FROM public.users WHERE role = 'member')::int                  AS total_fans,
        (SELECT COUNT(*) FROM public.members WHERE is_inside = true)::int               AS inside_now,
        (SELECT COUNT(*) FROM public.gate_scans WHERE direction = 'in'  AND scanned_at >= CURRENT_DATE)::int AS in_today,
        (SELECT COUNT(*) FROM public.gate_scans WHERE direction = 'out' AND scanned_at >= CURRENT_DATE)::int AS out_today
    `);

    /* =========================================================
       ACTIVITY — separate queries, each guarded
       ========================================================= */
    let activity = [];

    /* 1. Recent approved teams */
    try {
      const teamActivity = await db.query(`
        SELECT 
          'team_approved' AS type,
          t.name          AS title,
          'Approved'      AS detail,
          tr.reviewed_at  AS created_at
        FROM public.team_registrations tr
        JOIN public.teams t ON t.id = tr.team_id
        WHERE tr.status = 'approved' AND tr.reviewed_at IS NOT NULL
        ORDER BY tr.reviewed_at DESC
        LIMIT 3
      `);
      activity.push(...teamActivity.rows);
    } catch (e) {
      console.warn("⚠️ Team activity skipped:", e.message);
    }

    /* 2. Recent match results */
    try {
      const matchActivity = await db.query(`
        SELECT 
          'match_result' AS type,
          CONCAT(ta.name, ' vs ', tb.name) AS title,
          CONCAT(COALESCE(m.score_a, 0), ' - ', COALESCE(m.score_b, 0)) AS detail,
          COALESCE(m.updated_at, m.match_date) AS created_at
        FROM public.matches m
        JOIN public.teams ta ON ta.id = m.team_a_id
        JOIN public.teams tb ON tb.id = m.team_b_id
        WHERE m.status = 'completed'
        ORDER BY COALESCE(m.updated_at, m.match_date) DESC
        LIMIT 3
      `);
      activity.push(...matchActivity.rows);
    } catch (e) {
      console.warn("⚠️ Match activity skipped:", e.message);
    }

    /* 3. Recent gate scans */
    try {
      const scanActivity = await db.query(`
        SELECT 
          'gate_scan'   AS type,
          u.full_name   AS title,
          gs.direction  AS detail,
          gs.scanned_at AS created_at
        FROM public.gate_scans gs
        JOIN public.members m ON m.id = gs.member_id
        JOIN public.users   u ON u.id = m.user_id
        ORDER BY gs.scanned_at DESC
        LIMIT 3
      `);
      activity.push(...scanActivity.rows);
    } catch (e) {
      console.warn("⚠️ Gate scan activity skipped:", e.message);
    }

    /* Sort combined activity by date DESC, take top 5 */
    activity.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    activity = activity.slice(0, 5);

    return res.json({
      success: true,
      data: {
        stats: statsRes.rows[0],
        activity,
      },
    });
  } catch (error) {
    console.error("❌ Admin Stats Error:", error);
    return res.status(500).json({ success: false, message: "Failed to load stats" });
  }
};