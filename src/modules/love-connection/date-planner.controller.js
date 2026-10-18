// ============================================
// DATE-PLANNER.CONTROLLER.JS
// Connected to Supabase Database
// ============================================

const db = require('../../config/db'); // Your existing database connection

/**
 * POST /api/love/date-planner
 * Save her date plan
 */
exports.saveDatePlan = async (req, res, next) => {
  try {
    const { selected_date, date_type, custom_idea, notes } = req.body;

    // --- Validation ---
    if (!selected_date) {
      return res.status(400).json({
        success: false,
        message: 'Please pick a date, beautiful 💕'
      });
    }

    if (!date_type && !custom_idea) {
      return res.status(400).json({
        success: false,
        message: 'Choose an activity or write your own idea ✨'
      });
    }

    // --- Check if a date plan already exists ---
    const existingPlan = await db.query(
      `SELECT id FROM our_love_space 
       WHERE data_type = 'date_plan' 
       ORDER BY created_at DESC 
       LIMIT 1`
    );

    let result;

    if (existingPlan.rows.length > 0) {
      // Update existing plan
      result = await db.query(
        `UPDATE our_love_space 
         SET selected_date = $1,
             date_type = $2,
             custom_idea = $3,
             notes = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [selected_date, date_type, custom_idea, notes, existingPlan.rows[0].id]
      );
      
      console.log('💕 Date plan updated:', result.rows[0].id);
    } else {
      // Create new plan
      result = await db.query(
        `INSERT INTO our_love_space 
         (data_type, selected_date, date_type, custom_idea, notes)
         VALUES ('date_plan', $1, $2, $3, $4)
         RETURNING *`,
        [selected_date, date_type, custom_idea, notes]
      );
      
      console.log('💕 New date plan created:', result.rows[0].id);
    }

    return res.status(200).json({
      success: true,
      message: 'Our date is saved! Can\'t wait! 💕',
      date: result.rows[0]
    });

  } catch (err) {
    console.error('Save date error:', err);
    next(err);
  }
};

/**
 * GET /api/love/date-planner
 * Get her saved date plan
 */
exports.getDatePlan = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM our_love_space 
       WHERE data_type = 'date_plan' 
       ORDER BY updated_at DESC 
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        date: null,
        message: 'No date planned yet. Pick a day! 💕'
      });
    }

    return res.status(200).json({
      success: true,
      date: result.rows[0]
    });

  } catch (err) {
    console.error('Get date error:', err);
    next(err);
  }
};

/**
 * DELETE /api/love/date-planner
 * Reset/delete the saved date plan
 */
exports.deleteDatePlan = async (req, res, next) => {
  try {
    await db.query(
      `DELETE FROM our_love_space WHERE data_type = 'date_plan'`
    );

    return res.status(200).json({
      success: true,
      message: 'Date plan cleared. Let\'s plan something new! 💕'
    });

  } catch (err) {
    console.error('Delete date error:', err);
    next(err);
  }
};