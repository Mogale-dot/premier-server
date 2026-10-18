const db = require("../../config/db");
const { cache } = require("../../config/redis");

// ===============================
// GET MODERATION STATS
// ===============================
exports.getModerationStats = async (req, res) => {
  try {
    const userId = req.user?.id;
    console.log("📌 [Moderation Stats] User ID:", userId);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Check if user is super_admin
    console.log("🔍 [Moderation Stats] Checking admin role for user:", userId);
    const adminCheck = await db.query(
      `SELECT role FROM admin_auth WHERE id = $1`,
      [userId]
    );
    console.log("📊 [Moderation Stats] Admin check result:", adminCheck.rows);

    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'super_admin') {
      console.log("❌ [Moderation Stats] User is not super_admin");
      return res.status(403).json({
        success: false,
        message: "Forbidden - Admin access required",
      });
    }
    console.log("✅ [Moderation Stats] User is super_admin");

    // Get report stats
    console.log("📊 [Moderation Stats] Fetching report stats...");
    const reportStats = await db.query(`
      SELECT 
        COUNT(*) as total_reports,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_reports,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_reports,
        COUNT(CASE WHEN status = 'dismissed' THEN 1 END) as dismissed_reports,
        COUNT(CASE WHEN reason = 'spam' THEN 1 END) as spam_reports,
        COUNT(CASE WHEN reason = 'harassment' THEN 1 END) as harassment_reports,
        COUNT(CASE WHEN reason = 'hate_speech' THEN 1 END) as hate_speech_reports,
        COUNT(CASE WHEN reason = 'offensive' THEN 1 END) as offensive_reports,
        COUNT(CASE WHEN reason = 'other' THEN 1 END) as other_reports
      FROM post_reports
    `);
    console.log("📊 [Moderation Stats] Report stats:", reportStats.rows[0]);

    // Get blocked salons count
    console.log("📊 [Moderation Stats] Fetching blocked salons...");
    const blockedStats = await db.query(`
      SELECT COUNT(DISTINCT salon_id) as total_blocked
      FROM blocked_salons
    `);
    console.log("📊 [Moderation Stats] Blocked stats:", blockedStats.rows[0]);

    // Get hidden posts count
    console.log("📊 [Moderation Stats] Fetching hidden posts...");
    const hiddenStats = await db.query(`
      SELECT COUNT(*) as total_hidden
      FROM hidden_posts
    `);
    console.log("📊 [Moderation Stats] Hidden stats:", hiddenStats.rows[0]);

    const data = reportStats.rows[0];
    
    const responseData = {
      totalReports: parseInt(data.total_reports) || 0,
      pendingReports: parseInt(data.pending_reports) || 0,
      resolvedReports: parseInt(data.resolved_reports) || 0,
      dismissedReports: parseInt(data.dismissed_reports) || 0,
      blockedSalons: parseInt(blockedStats.rows[0].total_blocked) || 0,
      hiddenPosts: parseInt(hiddenStats.rows[0].total_hidden) || 0,
      reportsByReason: {
        spam: parseInt(data.spam_reports) || 0,
        harassment: parseInt(data.harassment_reports) || 0,
        hate_speech: parseInt(data.hate_speech_reports) || 0,
        offensive: parseInt(data.offensive_reports) || 0,
        other: parseInt(data.other_reports) || 0
      }
    };
    
    console.log("📤 [Moderation Stats] Sending response:", responseData);

    return res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error("❌ Get Moderation Stats Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get moderation stats",
      error: error.message
    });
  }
};

// ===============================
// GET ALL REPORTS
// ===============================
exports.getReports = async (req, res) => {
  try {
    const userId = req.user?.id;
    console.log("📌 [Get Reports] User ID:", userId);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Check if user is super_admin
    const adminCheck = await db.query(
      `SELECT role FROM admin_auth WHERE id = $1`,
      [userId]
    );

    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'super_admin') {
      console.log("❌ [Get Reports] User is not super_admin");
      return res.status(403).json({
        success: false,
        message: "Forbidden - Admin access required",
      });
    }
    console.log("✅ [Get Reports] User is super_admin");

    const { status, limit = 50, offset = 0 } = req.query;
    console.log("📊 [Get Reports] Filters:", { status, limit, offset });

    let query = `
      SELECT 
        pr.id,
        pr.post_id,
        pr.reporter_id,
        pr.reason,
        pr.status,
        pr.notes,
        pr.created_at,
        pr.resolved_at,
        pr.resolved_by,
        p.caption as post_caption,
        s.id as salon_id,
        s.name as salon_name,
        u.email as reporter_email,
        u.name as reporter_name
      FROM post_reports pr
      LEFT JOIN salon_posts p ON p.id = pr.post_id
      LEFT JOIN salons s ON s.id = p.salon_id
      LEFT JOIN users u ON u.id = pr.reporter_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      query += ` AND pr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY pr.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    console.log("📊 [Get Reports] Query:", query);
    console.log("📊 [Get Reports] Params:", params);

    const result = await db.query(query, params);
    console.log("📊 [Get Reports] Found:", result.rows.length, "reports");

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM post_reports pr
      WHERE 1=1
      ${status && status !== 'all' ? `AND pr.status = '${status}'` : ''}
    `;
    const countResult = await db.query(countQuery);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error("❌ Get Reports Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get reports",
      error: error.message
    });
  }
};

// ===============================
// HANDLE REPORT ACTION
// ===============================
exports.handleReportAction = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const userId = req.user?.id;
    const { reportId } = req.params;
    const { action } = req.body; // 'resolve', 'dismiss', 'delete_post'

    console.log("📌 [Handle Report] User ID:", userId);
    console.log("📌 [Handle Report] Report ID:", reportId);
    console.log("📌 [Handle Report] Action:", action);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Check if user is super_admin
    const adminCheck = await client.query(
      `SELECT role FROM admin_auth WHERE id = $1`,
      [userId]
    );

    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'super_admin') {
      console.log("❌ [Handle Report] User is not super_admin");
      return res.status(403).json({
        success: false,
        message: "Forbidden - Admin access required",
      });
    }
    console.log("✅ [Handle Report] User is super_admin");

    // Check if report exists
    const reportCheck = await client.query(
      `SELECT * FROM post_reports WHERE id = $1`,
      [reportId]
    );

    if (reportCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    const report = reportCheck.rows[0];
    console.log("📊 [Handle Report] Report found:", report);

    await client.query('BEGIN');

    let status = 'reviewed';
    let message = 'Report reviewed';

    switch (action) {
      case 'resolve':
        status = 'resolved';
        message = 'Report resolved';
        break;
      case 'dismiss':
        status = 'dismissed';
        message = 'Report dismissed';
        break;
      case 'delete_post':
        status = 'resolved';
        message = 'Post deleted and report resolved';
        // Delete the post
        await client.query(
          `UPDATE salon_posts SET is_deleted = true, updated_at = NOW() WHERE id = $1`,
          [report.post_id]
        );
        console.log("📊 [Handle Report] Post deleted:", report.post_id);
        break;
      default:
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: "Invalid action",
        });
    }

    // Update report
    await client.query(
      `UPDATE post_reports 
       SET status = $1, resolved_at = NOW(), resolved_by = $2, notes = COALESCE(notes, '') || ' | Action: ' || $3
       WHERE id = $4`,
      [status, userId, action, reportId]
    );

    await client.query('COMMIT');
    console.log("✅ [Handle Report] Report updated successfully");

    // Invalidate cache
    await cache.del(`moderation:stats`);

    return res.json({
      success: true,
      message: message,
      data: {
        id: reportId,
        status: status,
        action: action
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Handle Report Action Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process report action",
      error: error.message
    });
  } finally {
    client.release();
  }
};

// ===============================
// GET BLOCKED SALONS
// ===============================
exports.getBlockedSalons = async (req, res) => {
  try {
    const userId = req.user?.id;
    console.log("📌 [Get Blocked] User ID:", userId);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Check if user is super_admin
    const adminCheck = await db.query(
      `SELECT role FROM admin_auth WHERE id = $1`,
      [userId]
    );

    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'super_admin') {
      console.log("❌ [Get Blocked] User is not super_admin");
      return res.status(403).json({
        success: false,
        message: "Forbidden - Admin access required",
      });
    }
    console.log("✅ [Get Blocked] User is super_admin");

    const { limit = 50, offset = 0 } = req.query;
    console.log("📊 [Get Blocked] Filters:", { limit, offset });

    const query = `
      SELECT 
        bs.id,
        bs.user_id,
        bs.salon_id,
        bs.reason,
        bs.created_at,
        s.name as salon_name,
        s.logo_url as salon_logo,
        u.email as user_email,
        u.name as user_name
      FROM blocked_salons bs
      LEFT JOIN salons s ON s.id = bs.salon_id
      LEFT JOIN users u ON u.id = bs.user_id
      ORDER BY bs.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await db.query(query, [parseInt(limit), parseInt(offset)]);
    console.log("📊 [Get Blocked] Found:", result.rows.length, "blocked salons");

    // Get total count
    const countResult = await db.query(`SELECT COUNT(*) as total FROM blocked_salons`);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error("❌ Get Blocked Salons Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get blocked salons",
      error: error.message
    });
  }
};

// ===============================
// UNBLOCK SALON (Admin)
// ===============================
exports.unblockSalon = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const userId = req.user?.id;
    const { blockId } = req.params;

    console.log("📌 [Unblock] User ID:", userId);
    console.log("📌 [Unblock] Block ID:", blockId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Check if user is super_admin
    const adminCheck = await client.query(
      `SELECT role FROM admin_auth WHERE id = $1`,
      [userId]
    );

    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'super_admin') {
      console.log("❌ [Unblock] User is not super_admin");
      return res.status(403).json({
        success: false,
        message: "Forbidden - Admin access required",
      });
    }
    console.log("✅ [Unblock] User is super_admin");

    await client.query('BEGIN');

    const result = await client.query(
      `DELETE FROM blocked_salons WHERE id = $1 RETURNING *`,
      [blockId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Block record not found",
      });
    }

    await client.query('COMMIT');
    console.log("✅ [Unblock] Salon unblocked successfully");

    // Invalidate cache
    await cache.del(`moderation:stats`);

    return res.json({
      success: true,
      message: "Salon unblocked successfully",
      data: result.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Unblock Salon Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to unblock salon",
      error: error.message
    });
  } finally {
    client.release();
  }
};

// ===============================
// GET HIDDEN POSTS
// ===============================
exports.getHiddenPosts = async (req, res) => {
  try {
    const userId = req.user?.id;
    console.log("📌 [Get Hidden] User ID:", userId);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Check if user is super_admin
    const adminCheck = await db.query(
      `SELECT role FROM admin_auth WHERE id = $1`,
      [userId]
    );

    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'super_admin') {
      console.log("❌ [Get Hidden] User is not super_admin");
      return res.status(403).json({
        success: false,
        message: "Forbidden - Admin access required",
      });
    }
    console.log("✅ [Get Hidden] User is super_admin");

    const { limit = 50, offset = 0 } = req.query;
    console.log("📊 [Get Hidden] Filters:", { limit, offset });

    const query = `
      SELECT 
        hp.id,
        hp.user_id,
        hp.post_id,
        hp.created_at,
        p.caption as post_caption,
        s.id as salon_id,
        s.name as salon_name,
        u.email as user_email,
        u.name as user_name
      FROM hidden_posts hp
      LEFT JOIN salon_posts p ON p.id = hp.post_id
      LEFT JOIN salons s ON s.id = p.salon_id
      LEFT JOIN users u ON u.id = hp.user_id
      ORDER BY hp.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await db.query(query, [parseInt(limit), parseInt(offset)]);
    console.log("📊 [Get Hidden] Found:", result.rows.length, "hidden posts");

    // Get total count
    const countResult = await db.query(`SELECT COUNT(*) as total FROM hidden_posts`);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error("❌ Get Hidden Posts Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get hidden posts",
      error: error.message
    });
  }
};// ===============================
// GET SINGLE POST BY ID
// ===============================
exports.getPostById = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { postId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Check if user is admin (since this is from moderation)
    const adminCheck = await db.query(
      `SELECT role FROM admin_auth WHERE id = $1`,
      [userId]
    );

    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: "Forbidden - Admin access required",
      });
    }

    // ✅ REMOVED: p.is_deleted from SELECT and WHERE clause
    const query = `
      SELECT 
        p.id,
        p.caption,
        p.cover_image_url,
        p.like_count,
        p.comment_count,
        p.created_at,
        s.id as salon_id,
        s.name as salon_name,
        s.logo_url as salon_logo,
        (
          SELECT json_agg(
            json_build_object(
              'id', i.id,
              'url', i.image_url,
              'position', i.position
            )
            ORDER BY i.position ASC
          )
          FROM salon_post_images i
          WHERE i.post_id = p.id
        ) as images
      FROM salon_posts p
      JOIN salons s ON s.id = p.salon_id
      WHERE p.id = $1
    `;

    const result = await db.query(query, [postId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const post = result.rows[0];

    return res.json({
      success: true,
      data: {
        id: post.id,
        caption: post.caption || "",
        coverImageUrl: post.cover_image_url,
        likeCount: Number(post.like_count) || 0,
        commentCount: Number(post.comment_count) || 0,
        createdAt: post.created_at,
        salon: {
          id: post.salon_id,
          name: post.salon_name,
          logoUrl: post.salon_logo,
        },
        images: post.images || [],
      }
    });

  } catch (error) {
    console.error("❌ Get Post By ID Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get post",
      error: error.message
    });
  }
};