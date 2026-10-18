const db = require("../../config/db");
const { cache } = require("../../config/redis");

/**
 * GET /api/dashboard/users
 * Get all users with pagination, search, and filters
 */
exports.getAllUsers = async (req, res) => {
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
      role = "all",
      status = "all"
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

    if (search) {
      whereConditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role !== "all") {
      whereConditions.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (status !== "all") {
      const isActive = status === "active";
      whereConditions.push(`is_vip = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}` 
      : "";

    /* ===============================
       1️⃣ GET TOTAL COUNT
    ================================ */
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users
      ${whereClause}
    `;

    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    /* ===============================
       2️⃣ GET PAGINATED USERS
    ================================ */
    const dataQuery = `
      SELECT 
        id,
        name,
        email,
        role,
        is_vip as status,
        created_at
      
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parsedLimit, offset);
    const result = await db.query(dataQuery, params);

    /* ===============================
       3️⃣ RETURN RESPONSE
    ================================ */
    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });

  } catch (error) {
    console.error("❌ Get All Users Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load users",
    });
  }
};

/**
 * GET /api/dashboard/users/:id
 * Get single user details
 */
exports.getUserById = async (req, res) => {
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
        message: "User ID is required",
      });
    }

    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.role,
        u.is_vip as status,
        u.created_at,
        u.last_login_at,
        s.id as salon_id,
        s.name as salon_name
      FROM users u
      LEFT JOIN salons s ON s.owner_id = u.id
      WHERE u.id = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });

  } catch (error) {
    console.error("❌ Get User By ID Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load user details",
    });
  }
};

/**
 * DELETE /api/dashboard/users/:id
 * Soft delete a user
 */
exports.deleteUser = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const { id } = req.params;

    // Don't allow deleting yourself
    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    await client.query('BEGIN');

    // Check if user exists
    const checkUser = await client.query(
      `SELECT id, name, email FROM users WHERE id = $1`,
      [id]
    );

    if (checkUser.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

   
     // Delete the salon – this will cascade to all related tables
    await client.query(`DELETE FROM salons WHERE id = $1`, [id]);

    
    

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `User "${checkUser.rows[0].email}" has been deleted`,
      data: {
        id: checkUser.rows[0].id,
        name: checkUser.rows[0].name,
        email: checkUser.rows[0].email,
      },
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Delete User Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete user",
    });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/dashboard/users/:id/role
 * Update user role
 */
exports.updateUserRole = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['customer', 'salon_owner', 'super_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Allowed roles: customer, salon_owner, super_admin",
      });
    }

    await client.query('BEGIN');

    const updateQuery = `
      UPDATE users 
      SET role = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, email, role
    `;

    const result = await client.query(updateQuery, [role, id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: "User role updated successfully",
      data: result.rows[0],
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Update User Role Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user role",
    });
  } finally {
    client.release();
  }
};