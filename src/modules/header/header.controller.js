const db = require("../../config/db");
const { cache } = require("../../config/redis");

/**
 * GET /api/header/profile
 * Get current user's profile info (name, role, avatar)
 * Works for both super_admin and team members
 */
exports.getCurrentUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role?.trim();

    // Query user from database
    const query = `
      SELECT 
        id,
        name,
        email,
        role,
        avatar,
        department,
        created_at
      FROM admin_auth
      WHERE id = $1
    `;

    const result = await db.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    // Generate avatar initials if not set
    let avatar = user.avatar;
    if (!avatar) {
      const nameParts = user.name.split(' ');
      avatar = (nameParts[0].charAt(0) + (nameParts[1]?.charAt(0) || '')).toUpperCase();
    }

    // Determine display role
    let displayRole = '';
    if (userRole === 'super_admin') {
      displayRole = 'Super Admin';
    } else if (userRole === 'member') {
      // Get department for member
      const department = user.department || 'tech';
      const departmentNames = {
        tech: 'Tech Team',
        marketing: 'Marketing Team',
        sales: 'Sales Team',
        capital_raise: 'Capital Raise',
        email_linkedin: 'Email & LinkedIn'
      };
      displayRole = departmentNames[department] || 'Team Member';
    } else {
      displayRole = 'Admin';
    }

    return res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: userRole,
        displayRole: displayRole,
        avatar: avatar,
        department: user.department,
      },
    });

  } catch (error) {
    console.error("❌ GetCurrentUserProfile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load user profile",
    });
  }
};

/**
 * GET /api/header/launch-countdown
 * Get launch countdown based on latest task deadline from admin_tasks
 * Everyone can see this
 */
exports.getLaunchCountdown = async (req, res) => {
  try {
    // Get the latest task deadline from admin_tasks (not member_tasks)
    const query = `
      SELECT 
        MAX(due_date) as latest_deadline,
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
      FROM admin_tasks
      WHERE due_date IS NOT NULL
        
    `;

    const result = await db.query(query);
    const latestDeadline = result.rows[0]?.latest_deadline;
    const totalTasks = parseInt(result.rows[0]?.total_tasks || 0);
    const completedTasks = parseInt(result.rows[0]?.completed_tasks || 0);
    const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    let launchDate = null;
    let daysRemaining = null;
    let isLaunched = false;

    if (latestDeadline) {
      launchDate = new Date(latestDeadline);
      // Add 1 day to the latest deadline to get launch date
      const launchDateObj = new Date(launchDate);
      launchDateObj.setDate(launchDateObj.getDate() + 1);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const diffTime = launchDateObj - today;
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      isLaunched = daysRemaining <= 0;
    }

    // Also get upcoming important dates (optional)
    const upcomingTasks = await db.query(`
      SELECT 
        due_date,
        title,
        priority
      FROM admin_tasks
      WHERE due_date >= CURRENT_DATE
        AND status != 'done'
        
      ORDER BY due_date ASC
      LIMIT 3
    `);

    return res.json({
      success: true,
      data: {
        launchDate: launchDate ? launchDate.toISOString() : null,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        isLaunched: isLaunched,
        progress: progress,
        totalTasks: totalTasks,
        completedTasks: completedTasks,
        upcomingTasks: upcomingTasks.rows.map(task => ({
          dueDate: task.due_date,
          title: task.title,
          priority: task.priority,
        })),
      },
    });

  } catch (error) {
    console.error("❌ GetLaunchCountdown Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load launch countdown",
    });
  }
};

/**
 * GET /api/header/notifications
 * Get notifications for current user
 * (Simple version - can be expanded later)
 */
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role?.trim();

    let notifications = [];

    // For super_admin: get pending tasks and team updates
    if (userRole === 'super_admin') {
      // Get overdue tasks
      const overdueTasks = await db.query(`
        SELECT COUNT(*) as count
        FROM member_tasks
        WHERE status != 'completed'
          AND deadline < CURRENT_DATE
      `);
      
      if (parseInt(overdueTasks.rows[0].count) > 0) {
        notifications.push({
          id: 'overdue_tasks',
          type: 'warning',
          title: 'Overdue Tasks',
          message: `${overdueTasks.rows[0].count} task(s) are overdue`,
          icon: 'alert-circle',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }

      // Get pending team member requests (if any - placeholder)
      const pendingMembers = await db.query(`
        SELECT COUNT(*) as count
        FROM admin_auth
        WHERE role = 'member' AND created_at >= NOW() - INTERVAL '7 days'
      `);
      
      if (parseInt(pendingMembers.rows[0].count) > 0) {
        notifications.push({
          id: 'new_members',
          type: 'info',
          title: 'New Team Members',
          message: `${pendingMembers.rows[0].count} new team member(s) joined this week`,
          icon: 'users',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // For team members: get task reminders
    if (userRole === 'member') {
      // Get tasks due in next 3 days
      const upcomingTasks = await db.query(`
        SELECT COUNT(*) as count
        FROM member_tasks
        WHERE member_id = $1
          AND status != 'completed'
          AND deadline <= CURRENT_DATE + INTERVAL '3 days'
          AND deadline >= CURRENT_DATE
      `, [userId]);
      
      if (parseInt(upcomingTasks.rows[0].count) > 0) {
        notifications.push({
          id: 'upcoming_tasks',
          type: 'info',
          title: 'Upcoming Deadlines',
          message: `${upcomingTasks.rows[0].count} task(s) due in the next 3 days`,
          icon: 'calendar',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }

      // Get completed tasks today (achievement)
      const completedToday = await db.query(`
        SELECT COUNT(*) as count
        FROM member_tasks
        WHERE member_id = $1
          AND status = 'completed'
          AND completed_at::DATE = CURRENT_DATE
      `, [userId]);
      
      if (parseInt(completedToday.rows[0].count) > 0) {
        notifications.push({
          id: 'achievement',
          type: 'success',
          title: 'Great Job!',
          message: `You completed ${completedToday.rows[0].count} task(s) today!`,
          icon: 'award',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Default welcome notification if no others
    if (notifications.length === 0) {
      notifications.push({
        id: 'welcome',
        type: 'info',
        title: 'Welcome back!',
        message: 'No new notifications at this time.',
        icon: 'bell',
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: notifications,
      unreadCount: notifications.filter(n => !n.read).length,
    });

  } catch (error) {
    console.error("❌ GetNotifications Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load notifications",
    });
  }
};

/**
 * POST /api/header/notifications/:id/read
 * Mark a notification as read
 */
exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    // For now, just return success - in production, store read status in Redis or DB
    return res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("❌ MarkNotificationRead Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
    });
  }
};
/**
 * GET /api/header/task-progress
 * Get task completion progress for super admin (from admin_tasks)
 * Team members get their own task progress from member_tasks
 */
exports.getTaskProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role?.trim();

    let totalTasks = 0;
    let completedTasks = 0;
    let progress = 0;

    if (userRole === 'super_admin') {
      // Super admin: get stats from admin_tasks
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_tasks,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed_tasks
        FROM admin_tasks
        WHERE created_by IS NULL
          
      `);
      
      totalTasks = parseInt(result.rows[0]?.total_tasks || 0);
      completedTasks = parseInt(result.rows[0]?.completed_tasks || 0);
      progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
      
    } else if (userRole === 'member') {
      // Team member: get stats from member_tasks
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_tasks,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
        FROM member_tasks
        WHERE member_id = $1
      `, [userId]);
      
      totalTasks = parseInt(result.rows[0]?.total_tasks || 0);
      completedTasks = parseInt(result.rows[0]?.completed_tasks || 0);
      progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
    }

    return res.json({
      success: true,
      data: {
        totalTasks,
        completedTasks,
        progress,
      },
    });

  } catch (error) {
    console.error("❌ GetTaskProgress Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load task progress",
    });
  }
};