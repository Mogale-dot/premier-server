const db = require("../../config/db");
const { cache } = require("../../config/redis");

/**
 * Helper: Check if user is super_admin
 */
function isSuperAdmin(req) {
  return req.user?.role === 'super_admin';
}

/**
 * Helper: Get department color (for frontend)
 */
function getDepartmentColor(department) {
  const colors = {
    tech: '#3b82f6',
    marketing: '#10b981',
    sales: '#f59e0b',
    capital_raise: '#8b5cf6',
    email_linkedin: '#ef4444'
  };
  return colors[department] || '#6b7280';
}

/**
 * GET /api/team/members
 * Get all team members (all authenticated users can see)
 */
exports.getAllTeamMembers = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // All authenticated users can view team members
    const query = `
      SELECT 
        id,
        name,
        email,
        phone,
        avatar,
        role,
        department,
        email_address,
        linkedin_url,
        is_active,
        created_at
      FROM admin_auth
      WHERE is_active = 'TRUE'
      ORDER BY created_at DESC
    `;

    const result = await db.query(query);

    // Get task counts for each member
    const membersWithTasks = await Promise.all(result.rows.map(async (member) => {
      const taskStats = await db.query(`
        SELECT 
          COUNT(*) as total_tasks,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_tasks,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tasks
        FROM member_tasks
        WHERE member_id = $1
      `, [member.id]);

      // Get recent tasks (limit 3) - only title and status for non-super admins
      const recentTasks = await db.query(`
        SELECT 
          id,
          title,
          priority,
          status,
          deadline,
          created_at
        FROM member_tasks
        WHERE member_id = $1
        ORDER BY created_at DESC
        LIMIT 3
      `, [member.id]);

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        avatar: member.avatar,
        role: member.role,
        department: member.department,
        linkedin: member.linkedin_url,
        email_address: member.email_address,
        isActive: member.is_active,
        createdAt: member.created_at,
        departmentColor: getDepartmentColor(member.department),
        stats: {
          totalTasks: parseInt(taskStats.rows[0]?.total_tasks || 0),
          completedTasks: parseInt(taskStats.rows[0]?.completed_tasks || 0),
          pendingTasks: parseInt(taskStats.rows[0]?.pending_tasks || 0),
          inProgressTasks: parseInt(taskStats.rows[0]?.in_progress_tasks || 0),
        },
        recentTasks: recentTasks.rows.map(task => ({
          id: task.id,
          title: task.title,
          priority: task.priority,
          status: task.status,
          deadline: task.deadline,
        }))
      };
    }));

    return res.json({
      success: true,
      data: membersWithTasks,
    });

  } catch (error) {
    console.error("❌ GetAllTeamMembers Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load team members",
    });
  }
};

/**
 * GET /api/team/members/:id
 * Get single team member details (all authenticated users can see)
 */
exports.getTeamMemberById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    const userQuery = `
      SELECT 
        id,
        name,
        email,
        phone,
        avatar,
        role,
        department,
        email_address,
        linkedin_url,
        is_active,
        created_at
      FROM admin_auth
      WHERE id = $1 
    `;

    const userResult = await db.query(userQuery, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team member not found",
      });
    }

    const member = userResult.rows[0];

    // Get all tasks for this member
    // Super admin sees all details, members see only their own tasks fully
    let tasksResult;
    if (isSuperAdmin(req) || id === currentUserId) {
      // Super admin or the member themselves - see all task details
      tasksResult = await db.query(`
        SELECT 
          id,
          title,
          description,
          priority,
          status,
          deadline,
          completed_at,
          created_at
        FROM member_tasks
        WHERE member_id = $1
        ORDER BY 
          CASE status
            WHEN 'pending' THEN 1
            WHEN 'in_progress' THEN 2
            WHEN 'completed' THEN 3
          END,
          deadline ASC NULLS LAST
      `, [id]);
    } else {
      // Other members - see only task titles and status (not description)
      tasksResult = await db.query(`
        SELECT 
          id,
          title,
          priority,
          status,
          deadline,
          created_at
        FROM member_tasks
        WHERE member_id = $1
        ORDER BY 
          CASE status
            WHEN 'pending' THEN 1
            WHEN 'in_progress' THEN 2
            WHEN 'completed' THEN 3
          END,
          deadline ASC NULLS LAST
      `, [id]);
    }

    // Weekly progress calculation
    const weeklyProgressResult = await db.query(`
      SELECT COUNT(*) as completed_count
      FROM member_tasks
      WHERE member_id = $1 
        AND status = 'completed'
        AND completed_at >= NOW() - INTERVAL '7 days'
    `, [id]);

    const weeklyProgress = Math.min(Math.round((weeklyProgressResult.rows[0].completed_count / 10) * 100), 100);

    // Mock attendance (can be enhanced with actual attendance tracking)
    const attendance = {
      present: 5,
      total: 5,
      percentage: 100
    };

    return res.json({
      success: true,
      data: {
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        avatar: member.avatar,
        role: member.role,
        department: member.department,
        linkedin: member.linkedin_url,
        email_address: member.email_address,
        isActive: member.is_active,
        createdAt: member.created_at,
        departmentColor: getDepartmentColor(member.department),
        attendance: attendance,
        weeklyProgress: weeklyProgress,
        totalTasks: tasksResult.rows.length,
        completedTasks: tasksResult.rows.filter(t => t.status === 'completed').length,
        pendingTasks: tasksResult.rows.filter(t => t.status === 'pending').length,
        inProgressTasks: tasksResult.rows.filter(t => t.status === 'in_progress').length,
        tasks: tasksResult.rows.map(task => ({
          id: task.id,
          title: task.title,
          description: task.description || null,
          priority: task.priority,
          status: task.status,
          deadline: task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : null,
          completedAt: task.completed_at,
          createdAt: task.created_at,
        }))
      },
    });

  } catch (error) {
    console.error("❌ GetTeamMemberById Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load team member details",
    });
  }
};

/**
 * POST /api/team/tasks
 * Create a new task for a team member (Super Admin only)
 */
exports.createTask = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only super admin can create tasks.",
      });
    }

    const { memberId, title, description, priority, deadline } = req.body;

    if (!memberId || !title) {
      return res.status(400).json({
        success: false,
        message: "Member ID and task title are required",
      });
    }

    const validPriorities = ['high', 'medium', 'low'];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority. Allowed: high, medium, low",
      });
    }

    await client.query('BEGIN');

    // Check if member exists
    const memberCheck = await client.query(
      `SELECT id FROM admin_auth WHERE id = $1 `,
      [memberId]
    );

    if (memberCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Team member not found",
      });
    }

    const insertQuery = `
      INSERT INTO member_tasks (
        member_id, title, description, priority, deadline, assigned_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, title, priority, status, deadline
    `;

    const values = [
      memberId,
      title,
      description || "",
      priority || 'medium',
      deadline || null,
      req.user.id
    ];

    const result = await client.query(insertQuery, values);

    await client.query('COMMIT');

    return res.json({
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
 * PUT /api/team/tasks/:taskId/status
 * Update task status (member can update their own tasks, super admin can update any)
 */
exports.updateTaskStatus = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { taskId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const validStatuses = ['pending', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed: pending, in_progress, completed",
      });
    }

    await client.query('BEGIN');

    // Get task details
    const taskResult = await client.query(
      `SELECT member_id FROM member_tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const task = taskResult.rows[0];

    // Check permission: super admin OR the assigned member
    if (userRole !== 'super_admin' && task.member_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update your own tasks.",
      });
    }

    const updateQuery = `
      UPDATE member_tasks 
      SET 
        status = $1,
        completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END,
        updated_at = NOW()
      WHERE id = $2
      RETURNING id, status, completed_at
    `;

    const result = await client.query(updateQuery, [status, taskId]);

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

/**
 * DELETE /api/team/tasks/:taskId
 * Delete a task (Super Admin only)
 */
exports.deleteTask = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only super admin can delete tasks.",
      });
    }

    const { taskId } = req.params;

    await client.query('BEGIN');

    const deleteQuery = `DELETE FROM member_tasks WHERE id = $1 RETURNING id`;
    const result = await client.query(deleteQuery, [taskId]);

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
      message: "Task deleted successfully",
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
 * GET /api/team/tasks/:memberId
 * Get all tasks for a specific member
 */
exports.getMemberTasks = async (req, res) => {
  try {
    const { memberId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check permission: super admin OR the member themselves
    if (userRole !== 'super_admin' && memberId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view your own tasks.",
      });
    }

    let query;
    let params = [memberId];

    if (isSuperAdmin(req) || memberId === userId) {
      // Super admin or self - see all details
      query = `
        SELECT 
          id,
          title,
          description,
          priority,
          status,
          deadline,
          completed_at,
          created_at,
          assigned_by
        FROM member_tasks
        WHERE member_id = $1
        ORDER BY 
          CASE status
            WHEN 'pending' THEN 1
            WHEN 'in_progress' THEN 2
            WHEN 'completed' THEN 3
          END,
          deadline ASC NULLS LAST
      `;
    } else {
      // Other members - limited view
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view your own tasks.",
      });
    }

    const result = await db.query(query, params);

    return res.json({
      success: true,
      data: result.rows.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        deadline: task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : null,
        completedAt: task.completed_at,
        createdAt: task.created_at,
        assignedBy: task.assigned_by,
      })),
    });

  } catch (error) {
    console.error("❌ GetMemberTasks Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load tasks",
    });
  }
};

/**
 * GET /api/team/stats
 * Get team statistics (Super Admin only)
 */
exports.getTeamStats = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    // Get member counts by department
    const departmentStats = await db.query(`
      SELECT 
        department,
        COUNT(*) as count
      FROM admin_auth
      WHERE role = 'member'
      GROUP BY department
    `);

    // Get task statistics
    const taskStats = await db.query(`
      SELECT 
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_tasks,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tasks
      FROM member_tasks
    `);

    // Get overdue tasks
    const overdueTasks = await db.query(`
      SELECT COUNT(*) as count
      FROM member_tasks
      WHERE status != 'completed'
        AND deadline < CURRENT_DATE
    `);

    return res.json({
      success: true,
      data: {
        totalMembers: departmentStats.rows.reduce((sum, d) => sum + parseInt(d.count), 0),
        departments: departmentStats.rows,
        tasks: {
          total: parseInt(taskStats.rows[0]?.total_tasks || 0),
          completed: parseInt(taskStats.rows[0]?.completed_tasks || 0),
          pending: parseInt(taskStats.rows[0]?.pending_tasks || 0),
          inProgress: parseInt(taskStats.rows[0]?.in_progress_tasks || 0),
        },
        overdueTasks: parseInt(overdueTasks.rows[0]?.count || 0),
      },
    });

  } catch (error) {
    console.error("❌ GetTeamStats Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load team statistics",
    });
  }
};