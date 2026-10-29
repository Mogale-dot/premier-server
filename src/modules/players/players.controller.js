const db = require("../../config/db");

/* =========================================================
   GET ALL PLAYERS WITH STATS
   ========================================================= */
exports.getPlayers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         p.id,
         p.full_name,
         p.shirt_number,
         p.position,
         p.photo_url,
         t.id AS team_id,
         t.name AS team_name,
         t.logo_url AS team_logo,
         COALESCE(SUM(pms.goals), 0)::int   AS total_goals,
         COALESCE(SUM(pms.assists), 0)::int AS total_assists,
         (COALESCE(SUM(pms.goals), 0) + COALESCE(SUM(pms.assists), 0))::int AS total_gc
       FROM public.players p
       JOIN public.teams t ON t.id = p.team_id
       LEFT JOIN public.player_match_stats pms ON pms.player_id = p.id
       GROUP BY p.id, p.full_name, p.shirt_number, p.position, p.photo_url,
                t.id, t.name, t.logo_url
       ORDER BY total_goals DESC, total_assists DESC, p.full_name ASC`
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("❌ Get Players Error:", error);
    return res.status(500).json({ success: false, message: "Failed to load players" });
  }
};

/* =========================================================
   ADD PLAYER TO A TEAM
   ========================================================= */
exports.createPlayer = async (req, res) => {
  try {
    const { team_id, full_name, shirt_number, position, photo_url } = req.body;

    if (!team_id || !full_name) {
      return res.status(400).json({ success: false, message: "Team and player name are required" });
    }

    // Check shirt number uniqueness within team
    if (shirt_number) {
      const dup = await db.query(
        `SELECT id FROM public.players WHERE team_id = $1 AND shirt_number = $2`,
        [team_id, shirt_number]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Shirt #${shirt_number} is already used by another player in this team`,
        });
      }
    }

    const result = await db.query(
      `INSERT INTO public.players (team_id, full_name, shirt_number, position, photo_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, shirt_number, position`,
      [team_id, full_name, shirt_number || null, position || null, photo_url || null]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("❌ Create Player Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create player" });
  }
};

/* =========================================================
   UPDATE PLAYER
   ========================================================= */
exports.updatePlayer = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, shirt_number, position, photo_url } = req.body;

    const result = await db.query(
      `UPDATE public.players
       SET full_name    = COALESCE($1, full_name),
           shirt_number = COALESCE($2, shirt_number),
           position     = COALESCE($3, position),
           photo_url    = COALESCE($4, photo_url),
           updated_at   = NOW()
       WHERE id = $5
       RETURNING id, full_name, shirt_number, position`,
      [full_name || null, shirt_number || null, position || null, photo_url || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Player not found" });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("❌ Update Player Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update player" });
  }
};

/* =========================================================
   DELETE PLAYER
   ========================================================= */
exports.deletePlayer = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`DELETE FROM public.players WHERE id = $1 RETURNING id`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Player not found" });
    }
    return res.json({ success: true, message: "Player removed" });
  } catch (error) {
    console.error("❌ Delete Player Error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete player" });
  }
};