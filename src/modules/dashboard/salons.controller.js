const db = require("../../config/db");
const { cache } = require("../../config/redis");

/**
 * GET /api/dashboard/salons
 * Get all salons with pagination, search, and filters
 */
exports.getAllSalons = async (req, res) => {
  try {
    // Check if user is super_admin
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const { 
      page = 1, 
      limit = 10, 
      search = "", 
      profile = "all",
      status = "all",
      subscription = "all"
    } = req.query;
    
    // Validate and parse limit
    const parsedLimit = Math.min(parseInt(limit) || 10, 100);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid limit parameter",
      });
    }

    const offset = (parseInt(page) - 1) * parsedLimit;
    const params = [];
    let paramIndex = 1;

    // Build WHERE clause
    let whereConditions = [];

    // Search by salon name (from salons table)
    if (search) {
      whereConditions.push(`(s.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Profile filter (from salons table)
    if (profile !== "all") {
      whereConditions.push(`s.profile = $${paramIndex}`);
      params.push(profile);
      paramIndex++;
    }

    // Status filter (from salons table)
    if (status !== "all") {
      const isActive = status === "active";
      whereConditions.push(`s.is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    // Subscription status filter (from subscriptions table)
    if (subscription !== "all") {
      whereConditions.push(`sub.status = $${paramIndex}`);
      params.push(subscription);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}` 
      : "";

    /* ===============================
       1️⃣ GET TOTAL COUNT
    ================================ */
    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM salons s
      LEFT JOIN users u ON u.id = s.owner_id
      LEFT JOIN subscriptions sub ON sub.salon_id = s.id
      ${whereClause}
    `;

    const countResult = await db.query(countQuery, params.slice(0, paramIndex - 1));
    const total = parseInt(countResult.rows[0].total);

    /* ===============================
       2️⃣ GET PAGINATED SALONS
    ================================ */
    const dataQuery = `
      SELECT 
        s.id,
        s.name,
        s.bio,
        s.phone,
        s.location as address,
        s.categories,
    
        s.rating_avg,
        s.rating_count,
        s.is_open as status,
        s.logo_url,
        s.banner_url,
        s.socials,
        s.created_at as joined_date,
        u.email,
        sub.plan_id,
        sub.status as subscription_status,
        sub.expiry_date,
        (
          SELECT COUNT(*) FROM salon_posts WHERE salon_id = s.id 
        ) as total_posts,
        (
          SELECT COUNT(*) FROM salon_customers WHERE  salon_id = s.id
        ) as total_customers,
        (
          SELECT COUNT(*) FROM rewards WHERE salon_id = s.id 
        ) as total_rewards
      FROM salons s
      LEFT JOIN users u ON u.id = s.owner_id
      LEFT JOIN subscriptions sub ON sub.salon_id = s.id 
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataParams = [...params.slice(0, paramIndex - 1), parsedLimit, offset];
    const result = await db.query(dataQuery, dataParams);

    // Process the results to handle JSON arrays properly
    const processedSalons = result.rows.map(salon => ({
      id: salon.id,
      name: salon.name,
      email: salon.email,
      phone: salon.phone,
      address: salon.address,
      bio: salon.bio,
      categories: salon.categories || [], // This is an array
      profile: salon.profile,
      rating: parseFloat(salon.rating_avg) || 0,
      reviews: parseInt(salon.rating_count) || 0,
      status: salon.status,
      logo_url: salon.logo_url,
      banner_url: salon.banner_url,
      socials: salon.socials || {}, // This is a JSON object
      joined_date: salon.joined_date,
      subscription_status: salon.subscription_status,
      expiry_date: salon.expiry_date,
      total_posts: parseInt(salon.total_posts) || 0,
      total_customers: parseInt(salon.total_customers) || 0,
      total_rewards: parseInt(salon.total_rewards) || 0,
      // Extract social media for easy access
      instagram: salon.socials?.instagram || null,
      facebook: salon.socials?.facebook || null,
      whatsapp: salon.socials?.whatsapp || null,
      twitter: salon.socials?.twitter || null,
    }));

    /* ===============================
       3️⃣ RETURN RESPONSE
    ================================ */
    return res.json({
      success: true,
      data: processedSalons,
      pagination: {
        page: parseInt(page),
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });

  } catch (error) {
    console.error("❌ Get All Salons Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load salons",
    });
  }
};

/**
 * GET /api/dashboard/salons/:id
 * Get single salon details
 */
exports.getSalonById = async (req, res) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Salon ID is required",
      });
    }

    const query = `
      SELECT 
        s.id,
        s.name,
        s.bio,
        s.phone,
        s.location as address,
        s.categories,
        
       
        s.rating_avg,
        s.rating_count,
        s.is_active as status,
        s.logo_url,
        s.banner_url,
        s.socials,
        s.created_at as joined_date,
        s.updated_at,
        u.id as owner_id,
        u.name as owner_name,
        u.email,
        sub.plan_id,
        sub.status as subscription_status,
        sub.start_date,
        sub.expiry_date,
        sub.provider,
        (
          SELECT json_agg(
            json_build_object(
              'id', p.id,
              'caption', p.caption,
              'cover_image_url', p.cover_image_url,
              'like_count', p.like_count,
              'comment_count', p.comment_count,
              'created_at', p.created_at
            )
            ORDER BY p.created_at DESC
          )
          FROM salon_posts p
          WHERE p.salon_id = s.id 
          LIMIT 10
        ) as recent_posts,
        (
          SELECT json_agg(
            json_build_object(
              'id', r.id,
              'name', r.name,
              'points_required', r.points_required,
              'tier', r.tier
            )
          )
          FROM rewards r
          WHERE r.salon_id = s.id 
        ) as rewards
      FROM salons s
      LEFT JOIN users u ON u.id = s.owner_id
      LEFT JOIN subscriptions sub ON sub.salon_id = s.id
      WHERE s.id = $1 
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Salon not found",
      });
    }

    const salon = result.rows[0];
    
    // Process the salon data
    const processedSalon = {
      id: salon.id,
      name: salon.name,
      email: salon.email,
      owner_name: salon.owner_name,
      phone: salon.phone,
      address: salon.address,
      bio: salon.bio,
      categories: salon.categories || [],
     
      rating: parseFloat(salon.rating) || 0,
      reviews: parseInt(salon.reviews) || 0,
      status: salon.status,
      logo_url: salon.logo_url,
      banner_url: salon.banner_url,
      socials: salon.socials || {},
      joined_date: salon.joined_date,
      updated_at: salon.updated_at,
      subscription_status: salon.subscription_status,
      start_date: salon.start_date,
      expiry_date: salon.expiry_date,
      provider: salon.provider,
      recent_posts: salon.recent_posts || [],
      rewards: salon.rewards || [],
      // Extract social media for easy access
      instagram: salon.socials?.instagram || null,
      facebook: salon.socials?.facebook || null,
      whatsapp: salon.socials?.whatsapp || null,
      twitter: salon.socials?.twitter || null,
    };

    return res.json({
      success: true,
      data: processedSalon,
    });

  } catch (error) {
    console.error("❌ Get Salon By ID Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load salon details",
    });
  }
};

/**
 * DELETE /api/dashboard/salons/:id
 * Soft delete a salon
 */
exports.updateSalonStatus = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const { id } = req.params;

    await client.query('BEGIN');

    // Check if salon exists
    const checkSalon = await client.query(
      `SELECT id, name FROM salons WHERE id = $1`,
      [id]
    );

    if (checkSalon.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Salon not found",
      });
    }

    // Soft delete salon
    await client.query(
      `UPDATE salons SET deleted_at = NOW(), is_open = false WHERE id = $1`,
      [id]
    );

    // Also deactivate subscription
    await client.query(
      `UPDATE subscriptions SET status = 'cancelled', updated_at = NOW() WHERE salon_id = $1 `,
      [id]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `Salon "${checkSalon.rows[0].name}" has been deleted`,
      data: {
        id: checkSalon.rows[0].id,
        name: checkSalon.rows[0].name,
      },
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Delete Salon Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete salon",
    });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/dashboard/salons/:id/status
 * Update salon subscription status
 */
/**
 * DELETE /api/dashboard/salons/:id
 * Hard delete a salon and all related data
 */
/**
 * DELETE /api/dashboard/salons/:id
 * Hard delete a salon and its owner user (cascade deletes all related data)
 */
/**
 * DELETE /api/dashboard/salons/:id
 * Hard delete a salon and all related data (including foreign key dependencies)
 */
exports.deleteSalon = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const { id } = req.params;

    await client.query('BEGIN');

    // Get the salon and its owner_id
    const salonResult = await client.query(
      `SELECT id, name, owner_id FROM salons WHERE id = $1`,
      [id]
    );

    if (salonResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Salon not found",
      });
    }

    const salon = salonResult.rows[0];
    const ownerId = salon.owner_id;

    console.log(`🗑️ Deleting salon: ${salon.name} (${salon.id})`);

    // ============================================
    // 1️⃣ Delete dependent records in correct order
    // ============================================

    // Delete reward_redemptions (references rewards and customers)
    console.log('📝 Deleting reward_redemptions...');
    await client.query(`DELETE FROM reward_redemptions WHERE salon_id = $1`, [id]);

    // Delete post_likes (references posts)
    console.log('📝 Deleting post_likes...');
    await client.query(`
      DELETE FROM post_likes 
      WHERE post_id IN (SELECT id FROM salon_posts WHERE salon_id = $1)
    `, [id]);

    // Delete salon_post_images (references posts)
    console.log('📝 Deleting salon_post_images...');
    await client.query(`
      DELETE FROM salon_post_images 
      WHERE post_id IN (SELECT id FROM salon_posts WHERE salon_id = $1)
    `, [id]);

    // Delete salon_posts
    console.log('📝 Deleting salon_posts...');
    await client.query(`DELETE FROM salon_posts WHERE salon_id = $1`, [id]);

    // Delete reviews
    console.log('📝 Deleting reviews...');
    await client.query(`DELETE FROM reviews WHERE salon_id = $1`, [id]);

    // Delete visit_services (references visits)
    console.log('📝 Deleting visit_services...');
    await client.query(`
      DELETE FROM visit_services 
      WHERE visit_id IN (SELECT id FROM visits WHERE salon_id = $1)
    `, [id]);

    // Delete visits
    console.log('📝 Deleting visits...');
    await client.query(`DELETE FROM visits WHERE salon_id = $1`, [id]);

    // Delete rewards
    console.log('📝 Deleting rewards...');
    await client.query(`DELETE FROM rewards WHERE salon_id = $1`, [id]);

    // Delete services
    console.log('📝 Deleting services...');
    await client.query(`DELETE FROM services WHERE salon_id = $1`, [id]);

    // Delete members (salon_members)
    console.log('📝 Deleting salon_members...');
    await client.query(`DELETE FROM salon_members WHERE salon_id = $1`, [id]);

    // Delete subscriptions
    console.log('📝 Deleting subscriptions...');
    await client.query(`DELETE FROM subscriptions WHERE salon_id = $1`, [id]);

    // Delete payments
    console.log('📝 Deleting payments...');
    await client.query(`DELETE FROM subscriptions WHERE salon_id = $1`, [id]);

    // Delete salon_customers (join table)
    console.log('📝 Deleting salon_customers...');
    await client.query(`DELETE FROM salon_customers WHERE salon_id = $1`, [id]);

    // ============================================
    // 2️⃣ Delete the salon itself
    // ============================================
    console.log('📝 Deleting salon...');
    await client.query(`DELETE FROM salons WHERE id = $1`, [id]);

    // ============================================
    // 3️⃣ Delete the owner user (optional)
    // ============================================
    if (ownerId) {
      console.log('📝 Deleting owner user...');
      await client.query(`DELETE FROM users WHERE id = $1`, [ownerId]);
    }

    await client.query('COMMIT');

    console.log(`✅ Successfully deleted salon: ${salon.name}`);

    return res.json({
      success: true,
      message: `Salon "${salon.name}" and all associated data have been permanently deleted.`,
      data: {
        salonId: salon.id,
        salonName: salon.name,
        ownerId: ownerId,
      },
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Delete Salon Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete salon: " + error.message,
    });
  } finally {
    client.release();
  }
};