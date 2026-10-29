const db = require("../../config/db");

/* =========================================================
   GET FIXTURES FOR RESULTS PAGE
   ========================================================= */
exports.getMatchList = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         m.id,
         m.match_date,
         m.court,
         m.stage,
         m.group_name,
         m.status,
         m.score_a,
         m.score_b,
         ta.id AS team_a_id, ta.name AS team_a_name, ta.logo_url AS team_a_logo,
         tb.id AS team_b_id, tb.name AS team_b_name, tb.logo_url AS team_b_logo
       FROM public.matches m
       JOIN public.teams ta ON ta.id = m.team_a_id
       JOIN public.teams tb ON tb.id = m.team_b_id
       ORDER BY m.group_name ASC, m.match_date ASC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("❌ Get Match List Error:", error);
    return res.status(500).json({ success: false, message: "Failed to load matches" });
  }
};

/* =========================================================
   GET GROUP STANDINGS
   ========================================================= */
exports.getStandings = async (req, res) => {
  try {
    // Query the standings view we built earlier
    const result = await db.query(
      `SELECT * FROM public.team_standings ORDER BY group_name ASC, points DESC, goal_difference DESC, goals_for DESC`
    );

    // Group the standings by group_name
    const grouped = { A: [], B: [] };
    result.rows.forEach(row => {
      if (grouped[row.group_name]) grouped[row.group_name].push(row);
    });

    return res.json({ success: true, data: grouped });
  } catch (error) {
    console.error("❌ Get Standings Error:", error);
    return res.status(500).json({ success: false, message: "Failed to load standings" });
  }
};

/* =========================================================
   RECORD / UPDATE RESULT + PLAYER STATS
   ========================================================= */
exports.recordResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { score_a, score_b, scorers } = req.body;
    // scorers = [{ player_id, team_id, goals, assists }]

    if (!id || isNaN(score_a) || isNaN(score_b)) {
      return res.status(400).json({ success: false, message: "Invalid input" });
    }

    // 1. Update the match score + status
    const result = await db.query(
      `UPDATE public.matches 
       SET score_a = $1, score_b = $2, status = 'completed', updated_at = NOW()
       WHERE id = $3
       RETURNING id`,
      [score_a, score_b, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Match not found" });
    }

    // 2. Clear old player stats for this match (in case this is an edit)
    await db.query(`DELETE FROM public.player_match_stats WHERE match_id = $1`, [id]);

    // 3. Insert new player stats (goals + assists)
    if (scorers && scorers.length > 0) {
      const values = [];
      const params = [];
      let idx = 1;

      for (const s of scorers) {
        if (s.goals > 0 || s.assists > 0) {
          values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
          params.push(id, s.player_id, s.team_id, s.goals, s.assists);
        }
      }

      if (values.length > 0) {
        await db.query(
          `INSERT INTO public.player_match_stats (match_id, player_id, team_id, goals, assists)
           VALUES ${values.join(",")}`,
          params
        );
      }
    }

    return res.json({ success: true, message: "Result saved and standings updated" });
  } catch (error) {
    console.error("❌ Record Result Error:", error);
    return res.status(500).json({ success: false, message: "Failed to record result" });
  }
};

/* =========================================================
   GET PLAYERS OF A TEAM (for goal/assist selector)
   ========================================================= */
exports.getTeamPlayers = async (req, res) => {
  try {
    const { teamId } = req.params;
    const result = await db.query(
      `SELECT id, full_name, shirt_number FROM public.players WHERE team_id = $1 ORDER BY shirt_number ASC`,
      [teamId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("❌ Get Team Players Error:", error);
    return res.status(500).json({ success: false, message: "Failed to load players" });
  }
};  
/* =========================================================
   GET TOURNAMENT STAGE
   Returns:
   - stage: 'group_stage' | 'semi_final_ready' | 'completed'
   - semifinals: [{ group_a_1st, group_a_2nd, group_b_1st, group_b_2nd }]
   - eliminated: teams in 3rd place
   ========================================================= */
exports.getTournamentStage = async (req, res) => {
  try {
    /* ---- 1. Get all group-stage matches ---- */
    const matchesRes = await db.query(
      `SELECT id, group_name, status, team_a_id, team_b_id, score_a, score_b
       FROM public.matches
       WHERE stage = 'group_stage'`
    );
    const matches = matchesRes.rows;

    if (matches.length === 0) {
      return res.json({
        success: true,
        data: { stage: 'group_stage', semifinals: null, eliminated: [] },
      });
    }

    /* ---- 2. Are all group matches completed? ---- */
    const allCompleted = matches.every(m => m.status === 'completed');
    if (!allCompleted) {
      return res.json({
        success: true,
        data: { stage: 'group_stage', semifinals: null, eliminated: [] },
      });
    }

    /* ---- 3. Fetch standings (auto-computed by the view) ---- */
    const standingsRes = await db.query(
      `SELECT * FROM public.team_standings
       ORDER BY group_name ASC, points DESC, goal_difference DESC, goals_for DESC`
    );

    const groupA = standingsRes.rows.filter(r => r.group_name === 'A');
    const groupB = standingsRes.rows.filter(r => r.group_name === 'B');

    if (groupA.length < 3 || groupB.length < 3) {
      return res.json({
        success: true,
        data: { stage: 'group_stage', semifinals: null, eliminated: [] },
      });
    }

    /* ---- 4. Build semi-finals + eliminated ---- */
    const semifinals = {
      semi1: { team_a: groupA[0], team_b: groupB[1] },  
      semi2: { team_a: groupB[0], team_b: groupA[1] },  
    };

    const eliminated = [
      { group: 'A', ...groupA[2] },
      { group: 'B', ...groupB[2] },
    ];

    return res.json({
      success: true,
      data: {
        stage: 'semi_final_ready',
        semifinals,
        eliminated,
      },
    });
  } catch (error) {
    console.error("❌ Get Tournament Stage Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to determine tournament stage",
    });
  }
};