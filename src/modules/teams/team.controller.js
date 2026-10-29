const db = require("../../config/db");

/* =========================================================
   GET ALL TEAMS WITH STATS + PLAYERS
   ========================================================= */
exports.getTeams = async (req, res) => {
  try {
    /* ---- Teams with computed stats ---- */
    const teamsRes = await db.query(
      `SELECT 
         t.id, 
         t.name, 
         t.logo_url, 
         t.team_photo_url,
         t.coach_name, 
         t.created_at,
         COUNT(DISTINCT CASE WHEN m.status = 'completed' THEN m.id END)::int AS games_played,
         COALESCE(SUM(CASE 
           WHEN m.status = 'completed' AND m.team_a_id = t.id THEN m.score_a
           WHEN m.status = 'completed' AND m.team_b_id = t.id THEN m.score_b
         END), 0)::int AS goals_scored,
         COALESCE(SUM(CASE 
           WHEN m.status = 'completed' AND m.team_a_id = t.id THEN m.score_b
           WHEN m.status = 'completed' AND m.team_b_id = t.id THEN m.score_a
         END), 0)::int AS goals_conceded,
         COUNT(DISTINCT CASE WHEN m.status = 'completed' AND m.team_a_id = t.id AND m.score_a > m.score_b THEN m.id END)::int +
         COUNT(DISTINCT CASE WHEN m.status = 'completed' AND m.team_b_id = t.id AND m.score_b > m.score_a THEN m.id END)::int AS wins,
         COUNT(DISTINCT CASE WHEN m.status = 'completed' AND m.score_a = m.score_b THEN m.id END)::int AS draws,
         COUNT(DISTINCT CASE WHEN m.status = 'completed' AND m.team_a_id = t.id AND m.score_a < m.score_b THEN m.id END)::int +
         COUNT(DISTINCT CASE WHEN m.status = 'completed' AND m.team_b_id = t.id AND m.score_b < m.score_a THEN m.id END)::int AS losses
       FROM public.teams t
       LEFT JOIN public.matches m ON m.team_a_id = t.id OR m.team_b_id = t.id
       GROUP BY t.id, t.name, t.logo_url, t.team_photo_url, t.coach_name, t.created_at
       ORDER BY t.name ASC`
    );

    /* ---- Players grouped by team ---- */
    const playersRes = await db.query(
      `SELECT 
         p.id,
         p.team_id,
         p.full_name,
         p.shirt_number,
         p.position,
         COALESCE(SUM(pms.goals), 0)::int   AS goals,
         COALESCE(SUM(pms.assists), 0)::int AS assists
       FROM public.players p
       LEFT JOIN public.player_match_stats pms ON pms.player_id = p.id
       GROUP BY p.id, p.team_id, p.full_name, p.shirt_number, p.position
       ORDER BY p.shirt_number ASC NULLS LAST, p.full_name ASC`
    );

    const playersByTeam = {};
    playersRes.rows.forEach(p => {
      if (!playersByTeam[p.team_id]) playersByTeam[p.team_id] = [];
      playersByTeam[p.team_id].push({
        id: p.id,
        name: p.full_name,
        full_name: p.full_name,
        num: p.shirt_number || '—',
        position: p.position || '—',
        goals: p.goals,
        assists: p.assists,
        apps: 0,
      });
    });

    /* ---- Combine into a single response per team ---- */
    const teams = teamsRes.rows.map(t => {
      const wins    = t.wins || 0;
      const draws   = t.draws || 0;
      const losses  = t.losses || 0;
      const points  = (wins * 3) + draws;
      const gf      = t.goals_scored   || 0;
      const ga      = t.goals_conceded || 0;
      const gd      = gf - ga;

      return {
        id: t.id,
        name: t.name,

        /* Raw DB columns — used by admin pages */
        logo_url:       t.logo_url,
        team_photo_url: t.team_photo_url,
        coach_name:     t.coach_name || '—',
        created_at:     t.created_at,

        /* Friendly aliases — used by public pages */
        logo:  t.logo_url,
        photo: t.team_photo_url,
        coach: t.coach_name || '—',

        /* Top-level stat fields — used by admin pages */
        games_played:   t.games_played,
        goals_scored:   gf,
        goals_conceded: ga,
        wins,
        draws,
        losses,
        points,

        /* Nested stats — used by public pages */
        players: playersByTeam[t.id] || [],
        stats: {
          played: t.games_played,
          wins,
          draws,
          losses,
          gf,
          ga,
          gd,
          points,
        },
      };
    });

    return res.json({ success: true, data: teams });
  } catch (error) {
    console.error("❌ Get Teams Error:", error);
    return res.status(500).json({ success: false, message: "Failed to load teams" });
  }
};


/* =========================================================
   CREATE TEAM
   ========================================================= */
exports.createTeam = async (req, res) => {
  try {
    const { name, coach_name, logo_url, team_photo_url } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "Team name is required" });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const result = await db.query(
      `INSERT INTO public.teams (name, slug, coach_name, logo_url, team_photo_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, slug, coach_name, logo_url, team_photo_url`,
      [name, slug, coach_name || null, logo_url || null, team_photo_url || null]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("❌ Create Team Error:", error);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: "Team name already exists" });
    }
    return res.status(500).json({ success: false, message: "Failed to create team" });
  }
};


/* =========================================================
   UPDATE TEAM
   ========================================================= */
exports.updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, coach_name, logo_url, team_photo_url } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "Team ID required" });
    }

    const result = await db.query(
      `UPDATE public.teams
       SET name           = COALESCE($1, name),
           coach_name     = COALESCE($2, coach_name),
           logo_url       = COALESCE($3, logo_url),
           team_photo_url = COALESCE($4, team_photo_url),
           updated_at     = NOW()
       WHERE id = $5
       RETURNING id, name, coach_name, logo_url, team_photo_url`,
      [name || null, coach_name || null, logo_url || null, team_photo_url || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Team not found" });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("❌ Update Team Error:", error);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: "Team name already exists" });
    }
    return res.status(500).json({ success: false, message: "Failed to update team" });
  }
};


/* =========================================================
   DELETE TEAM (cascades to players, fixtures, registrations)
   ========================================================= */
exports.deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === 'NaN' || id === 'undefined' || id === 'null') {
      return res.status(400).json({ success: false, message: "Invalid team ID" });
    }

    await db.query(`DELETE FROM public.matches WHERE team_a_id = $1 OR team_b_id = $1`, [id]);
    await db.query(`DELETE FROM public.players WHERE team_id = $1`, [id]);
    await db.query(`DELETE FROM public.team_registrations WHERE team_id = $1`, [id]);

    const result = await db.query(
      `DELETE FROM public.teams WHERE id = $1 RETURNING id, name`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Team not found" });
    }

    return res.json({ success: true, message: "Team removed" });
  } catch (error) {
    console.error("❌ Delete Team Error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete team" });
  }
};


/* =========================================================
   GET FIXTURES
   ========================================================= */
exports.getFixtures = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         m.id, m.match_date, m.court, m.stage, m.group_name, m.status, m.score_a, m.score_b,
         ta.id AS team_a_id, ta.name AS team_a_name, ta.logo_url AS team_a_logo,
         tb.id AS team_b_id, tb.name AS team_b_name, tb.logo_url AS team_b_logo
       FROM public.matches m
       JOIN public.teams ta ON ta.id = m.team_a_id
       JOIN public.teams tb ON tb.id = m.team_b_id
       ORDER BY m.group_name ASC, m.match_date ASC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("❌ Get Fixtures Error:", error);
    return res.status(500).json({ success: false, message: "Failed to load fixtures" });
  }
};


/* =========================================================
   CREATE FIXTURE MANUALLY
   ========================================================= */
exports.createFixture = async (req, res) => {
  try {
    const { team_a_id, team_b_id, match_date, court, stage, group_name } = req.body;

    if (!team_a_id || !team_b_id || !match_date) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    if (team_a_id === team_b_id) {
      return res.status(400).json({ success: false, message: "Teams must be different" });
    }

    const tournRes = await db.query(`SELECT id FROM public.tournaments LIMIT 1`);
    let tournamentId = tournRes.rows[0]?.id;
    if (!tournamentId) {
      const newT = await db.query(`INSERT INTO public.tournaments (name, format) VALUES ('PCL 2026', 'top6') RETURNING id`);
      tournamentId = newT.rows[0].id;
    }

    const result = await db.query(
      `INSERT INTO public.matches (tournament_id, team_a_id, team_b_id, match_date, court, stage, group_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
       RETURNING id`,
      [tournamentId, team_a_id, team_b_id, match_date, court || 'Court A', stage || 'group_stage', group_name || null]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("❌ Create Fixture Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create fixture" });
  }
};


/* =========================================================
   DELETE FIXTURE
   ========================================================= */
exports.deleteFixture = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id === 'NaN' || id === 'undefined' || id === 'null') {
      return res.status(400).json({ success: false, message: "Invalid fixture ID" });
    }

    const result = await db.query(
      `DELETE FROM public.matches WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Fixture not found" });
    }

    return res.json({ success: true, message: "Fixture removed" });
  } catch (error) {
    console.error("❌ Delete Fixture Error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete fixture" });
  }
};


/* =========================================================
   AUTO-GENERATE GROUP FIXTURES (Single Round Robin)
   ========================================================= */
exports.generateGroupFixtures = async (req, res) => {
  try {
    const { teamIds } = req.body;

    if (!teamIds || teamIds.length !== 6) {
      return res.status(400).json({ success: false, message: "Exactly 6 teams required for Top 6 format" });
    }

    /* ---- 1. Get or create a tournament ---- */
    const tournRes = await db.query(`SELECT id FROM public.tournaments LIMIT 1`);
    let tournamentId = tournRes.rows[0]?.id;
    if (!tournamentId) {
      const newT = await db.query(`INSERT INTO public.tournaments (name, format) VALUES ('PCL 2026', 'top6') RETURNING id`);
      tournamentId = newT.rows[0].id;
    }

    /* ---- 2. Clear existing group fixtures for this tournament ---- */
    await db.query(
      `DELETE FROM public.matches WHERE tournament_id = $1 AND stage = 'group_stage'`,
      [tournamentId]
    );

    /* ---- 3. Shuffle teams randomly ---- */
    const shuffled = [...teamIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    /* ---- 4. Split into groups ---- */
    const groupA = shuffled.slice(0, 3);
    const groupB = shuffled.slice(3, 6);

    /* ---- 5. Single round-robin within each group ---- */
    function roundRobin(group, groupName) {
      const fixtures = [];
      const slots = ['10:00', '11:30', '13:00', '14:30', '16:00', '17:30'];
      let slotIdx = 0;

      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          fixtures.push({
            teamA: group[i],
            teamB: group[j],
            date: `2026-10-25T${slots[slotIdx % slots.length]}:00`,
            groupName,
          });
          slotIdx++;
        }
      }
      return fixtures;
    }

    const fixturesA = roundRobin(groupA, 'A');
    const fixturesB = roundRobin(groupB, 'B');
    const allFixtures = [...fixturesA, ...fixturesB];

    /* ---- 6. Insert into database ---- */
    for (const f of allFixtures) {
      await db.query(
        `INSERT INTO public.matches (tournament_id, team_a_id, team_b_id, match_date, court, stage, group_name, status)
         VALUES ($1, $2, $3, $4, 'Court A', 'group_stage', $5, 'scheduled')`,
        [tournamentId, f.teamA, f.teamB, f.date, f.groupName]
      );
    }

    return res.json({
      success: true,
      message: `Generated ${allFixtures.length} group fixtures (3 per group).`,
    });
  } catch (error) {
    console.error("❌ Generate Group Fixtures Error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate fixtures" });
  }
};