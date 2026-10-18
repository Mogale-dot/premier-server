const db = require("../../config/db");
const { cache } = require("../../config/redis");

/**
 * Helper: Check if user is super_admin
 */
function isSuperAdmin(req) {
  return req.user?.role === 'super_admin';
}

/**
 * GET /api/dashboard/tasks
 * Get all tasks with pagination, filters, sorting
 */
exports.getAllTasks = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const {
      page = 1,
      limit = 20,
      category = "all",
      status = "all",
      priority = "all",
      sort = "created_at",
      order = "DESC"
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 20, 100);
    const offset = (parseInt(page) - 1) * parsedLimit;

    const params = [];
    let paramIndex = 1;
    const whereConditions = [];

    if (category !== "all") {
      whereConditions.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }
    if (status !== "all") {
      whereConditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    if (priority !== "all") {
      whereConditions.push(`priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // Count total
    const countQuery = `SELECT COUNT(*) as total FROM admin_tasks ${whereClause}`;
    const countResult = await db.query(countQuery, params.slice(0, paramIndex - 1));
    const total = parseInt(countResult.rows[0].total);

    // Fetch tasks with sorting
    const allowedSortColumns = ['title', 'category', 'priority', 'status', 'due_date', 'created_at', 'updated_at'];
    const sortColumn = allowedSortColumns.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const dataQuery = `
      SELECT
        id,
        title,
        description,
        category,
        priority,
        status,
        due_date,
        completed_at,
        created_at,
        updated_at
      FROM admin_tasks
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataParams = [...params.slice(0, paramIndex - 1), parsedLimit, offset];
    const result = await db.query(dataQuery, dataParams);

    // Calculate category counts for progress bar
    const categoryCounts = await db.query(`
      SELECT category, COUNT(*) as count
      FROM admin_tasks
      GROUP BY category
    `);

    const completedCount = await db.query(`
      SELECT COUNT(*) as count FROM admin_tasks WHERE status = 'done'
    `);
    const completed = parseInt(completedCount.rows[0].count);
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
      progress: {
        total,
        completed,
        percentage: progress,
        categories: categoryCounts.rows,
      },
    });
  } catch (error) {
    console.error("❌ GetAllTasks Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load tasks",
    });
  }
};

/**
 * GET /api/dashboard/tasks/:id
 * Get single task
 */
exports.getTaskById = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const { id } = req.params;
    const result = await db.query(
      `SELECT * FROM admin_tasks WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("❌ GetTaskById Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load task",
    });
  }
};

/**
 * POST /api/dashboard/tasks
 * Create a new task
 */
exports.createTask = async (req, res) => {
  const client = await db.pool.connect();
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const { title, description, category, priority, due_date } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Task title is required",
      });
    }

    const validCategories = ['backend', 'frontend', 'design', 'deployment', 'ai', 'other'];
    const validPriorities = ['high', 'medium', 'low'];

    const finalCategory = validCategories.includes(category) ? category : 'other';
    const finalPriority = validPriorities.includes(priority) ? priority : 'medium';

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO admin_tasks (title, description, category, priority, due_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [title, description || '', finalCategory, finalPriority, due_date || null]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ CreateTask Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create task",
    });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/dashboard/tasks/:id
 * Update a task
 */
exports.updateTask = async (req, res) => {
  const client = await db.pool.connect();
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const { id } = req.params;
    const { title, description, category, priority, status, due_date } = req.body;

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      // If status is 'done', set completed_at to NOW()
      if (status === 'done') {
        updates.push(`completed_at = NOW()`);
      } else if (status !== 'done') {
        updates.push(`completed_at = NULL`);
      }
      params.push(status);
      paramIndex++;
    }
    if (due_date !== undefined) {
      updates.push(`due_date = $${paramIndex}`);
      params.push(due_date);
      paramIndex++;
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    await client.query('BEGIN');

    const query = `
      UPDATE admin_tasks
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    params.push(id);

    const result = await client.query(query, params);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: "Task updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ UpdateTask Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update task",
    });
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/dashboard/tasks/:id
 * Delete a task
 */
exports.deleteTask = async (req, res) => {
  const client = await db.pool.connect();
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query(
      `DELETE FROM admin_tasks WHERE id = $1 RETURNING id, title`,
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `Task "${result.rows[0].title}" deleted successfully`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ DeleteTask Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete task",
    });
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/dashboard/tasks/:id/status
 * Quick status update (for checkbox toggle)
 */
exports.updateTaskStatus = async (req, res) => {
  const client = await db.pool.connect();
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['todo', 'in_progress', 'done'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed: todo, in_progress, done",
      });
    }

    await client.query('BEGIN');

    let query = `
      UPDATE admin_tasks
      SET status = $1, updated_at = NOW()
    `;
    const params = [status, id];

    if (status === 'done') {
      query += `, completed_at = NOW()`;
    } else {
      query += `, completed_at = NULL`;
    }
    query += ` WHERE id = $2 RETURNING *`;

    const result = await client.query(query, params);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: "Task status updated",
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ UpdateTaskStatus Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update task status",
    });
  } finally {
    client.release();
  }
};