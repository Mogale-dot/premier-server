// ============================================
// BIBLE-STUDY.CONTROLLER.JS
// Shared Bible Study Notes
// ============================================

const db = require('../../config/db');

/**
 * GET /api/love/bible-study
 * Get all bible study notes
 */
exports.getNotes = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM bible_study_notes 
       ORDER BY study_date DESC, created_at DESC`
    );

    return res.status(200).json({
      success: true,
      notes: result.rows
    });

  } catch (err) {
    console.error('Get bible study notes error:', err);
    return res.status(500).json({
      success: false,
      message: 'Could not load study notes'
    });
  }
};

/**
 * POST /api/love/bible-study
 * Save a new bible study note
 */
exports.saveNote = async (req, res, next) => {
  try {
    const { 
      study_date, 
      book, 
      chapter, 
      verses, 
      topic, 
      notes, 
      reflection,
      prayer_points 
    } = req.body;

    console.log('📖 Saving bible study note:', { study_date, book, chapter });

    // --- Validation ---
    if (!study_date || !book || !chapter) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in the date, book, and chapter 📖'
      });
    }

    const result = await db.query(
      `INSERT INTO bible_study_notes 
       (study_date, book, chapter, verses, topic, notes, reflection, prayer_points)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        study_date,
        book,
        chapter,
        verses || '',
        topic || '',
        notes || '',
        reflection || '',
        prayer_points || ''
      ]
    );

    console.log('✅ Bible study note saved:', result.rows[0].id);

    return res.status(201).json({
      success: true,
      message: 'Study notes saved! God is good! 🙏',
      note: result.rows[0]
    });

  } catch (err) {
    console.error('Save bible study note error:', err);
    return res.status(500).json({
      success: false,
      message: 'Could not save study note. Please try again.'
    });
  }
};

/**
 * DELETE /api/love/bible-study/:id
 * Delete a study note
 */
exports.deleteNote = async (req, res, next) => {
  try {
    const { id } = req.params;

    console.log('🗑️ Deleting bible study note:', id);

    const result = await db.query(
      `DELETE FROM bible_study_notes WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Note removed 📖'
    });

  } catch (err) {
    console.error('Delete bible study note error:', err);
    return res.status(500).json({
      success: false,
      message: 'Could not delete note'
    });
  }
};