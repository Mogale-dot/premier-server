const db = require("../../config/db");
const { cache } = require("../../config/redis");

/**
 * Helper: Check super admin
 */
function isSuperAdmin(req) {
  return req.user?.role === 'super_admin';
}

/**
 * GET /api/dashboard/overview/stats
 * Returns all metrics for the overview page
 */
exports.getOverviewStats = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    // 1️⃣ Total Salons (not soft-deleted)
    const totalSalonsResult = await db.query(
      `SELECT COUNT(*) as count FROM salons WHERE deleted_at IS NULL`
    );
    const totalSalons = parseInt(totalSalonsResult.rows[0].count);

    // 2️⃣ Monthly Recurring Revenue (Premium subscriptions count * 230)
    // Assuming subscription_plans table has name = 'premium' and price = 230
    const mrrResult = await db.query(`
      SELECT COUNT(*) as premium_count
      FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.status = 'active'
        AND s.expiry_date > NOW()
        AND sp.name ILIKE '%premium%'
       
    `);
    const premiumCount = parseInt(mrrResult.rows[0].premium_count);
    const mrr = premiumCount * 230;

    // 3️⃣ Total Customers (users with role = 'customer')
    const totalCustomersResult = await db.query(
      `SELECT COUNT(*) as count FROM users WHERE role = 'customer' `
    );
    const totalCustomers = parseInt(totalCustomersResult.rows[0].count);

    // 4️⃣ Overall Progress (from admin_tasks)
    const progressResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed
      FROM admin_tasks
      WHERE created_by = $1
    `, [req.user.id]);
    const totalTasks = parseInt(progressResult.rows[0].total);
    const completedTasks = parseInt(progressResult.rows[0].completed);
    const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    // 5️⃣ Launch countdown: max due_date from tasks + 1 day
    const maxDueResult = await db.query(`
      SELECT MAX(due_date) as max_due FROM admin_tasks WHERE due_date IS NOT NULL
    `);
    let launchDate = null;
    if (maxDueResult.rows[0].max_due) {
      const maxDue = new Date(maxDueResult.rows[0].max_due);
      launchDate = new Date(maxDue);
      launchDate.setDate(launchDate.getDate() + 1);
    } else {
      // fallback: use a default future date
      launchDate = new Date();
      launchDate.setMonth(launchDate.getMonth() + 1);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = launchDate - today;
    const launchDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // 6️⃣ Alerts
    // a) Tasks due in next 3 days (excluding today)
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    threeDaysFromNow.setHours(23, 59, 59, 999);
    const upcomingTasksResult = await db.query(`
      SELECT COUNT(*) as count
      FROM admin_tasks
      WHERE status != 'done'
        AND due_date IS NOT NULL
        AND due_date > CURRENT_DATE
        AND due_date <= $1
    `, [threeDaysFromNow.toISOString().split('T')[0]]);
    const upcomingTasksCount = parseInt(upcomingTasksResult.rows[0].count);

    // b) Tasks due today
    const todayTasksResult = await db.query(`
      SELECT COUNT(*) as count
      FROM admin_tasks
      WHERE status != 'done'
        AND due_date = CURRENT_DATE
    `);
    const todayTasksCount = parseInt(todayTasksResult.rows[0].count);

    // c) Growth: % increase in customers over last 30 days
    const growthResult = await db.query(`
      WITH current_month AS (
        SELECT COUNT(*) as current_count
        FROM users
        WHERE role = 'customer'
          AND created_at >= NOW() - INTERVAL '30 days'
          AND deleted_at IS NULL
      ),
      previous_month AS (
        SELECT COUNT(*) as previous_count
        FROM users
        WHERE role = 'customer'
          AND created_at >= NOW() - INTERVAL '60 days'
          AND created_at < NOW() - INTERVAL '30 days'
          AND deleted_at IS NULL
      )
      SELECT 
        COALESCE(current_month.current_count, 0) as current_count,
        COALESCE(previous_month.previous_count, 1) as previous_count
      FROM current_month, previous_month
    `);
    const currentCount = parseInt(growthResult.rows[0].current_count);
    const previousCount = parseInt(growthResult.rows[0].previous_count);
    const growthPercent = previousCount === 0 ? 0 : Math.round(((currentCount - previousCount) / previousCount) * 100);

    // Build response
    return res.json({
      success: true,
      data: {
        totalSalons,
        mrr,
        totalCustomers,
        progress,
        launchDays,
        alerts: {
          upcomingTasks: upcomingTasksCount,
          tasksDueToday: todayTasksCount,
          growthPercent,
        },
        launchDate: launchDate.toISOString(),
      },
    });

  } catch (error) {
    console.error("❌ Overview Stats Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load overview stats",
    });
  }
};

/**
 * GET /api/dashboard/overview/recent-activity
 * Returns recent activities (new salons, subscriptions, customers)
 */
exports.getRecentActivity = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin only.",
      });
    }

    // New salons in last 7 days
    const newSalons = await db.query(`
      SELECT 'new_salon' as type, name as description, created_at as date
      FROM salons
      WHERE created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // New subscriptions in last 7 days
    const newSubscriptions = await db.query(`
      SELECT 'subscription' as type, 'Subscription renewed' as description, created_at as date
      FROM subscriptions
      WHERE created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // New customers in last 7 days
    const newCustomers = await db.query(`
      SELECT 'new_customer' as type, name as description, created_at as date
      FROM users
      WHERE role = 'customer' AND created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Combine and sort by date descending
    const activities = [
      ...newSalons.rows.map(r => ({ ...r, description: `New salon: ${r.description}` })),
      ...newSubscriptions.rows.map(r => ({ ...r, description: r.description })),
      ...newCustomers.rows.map(r => ({ ...r, description: `New customer: ${r.description}` })),
    ];
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recentActivities = activities.slice(0, 10);

    return res.json({
      success: true,
      data: recentActivities,
    });
  } catch (error) {
    console.error("❌ Recent Activity Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load recent activity",
    });
  }
};