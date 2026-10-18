// ============================================
// LOVE.ROUTES.JS
// ============================================

const router = require('express').Router();
const controller = require('./love.controller');
const datePlannerController = require('./date-planner.controller');
const bibleStudyController = require('./bible-study.controller');
const { verifyLoveToken } = require('./love.middleware');

// --- Public Routes ---
router.post('/login', controller.login);
router.get('/heartbeat', controller.heartbeat);

// --- Protected Routes ---
router.get('/verify', verifyLoveToken, controller.verifyToken);

// --- Date Planner Routes ---
router.post('/date-planner', verifyLoveToken, datePlannerController.saveDatePlan);
router.get('/date-planner', verifyLoveToken, datePlannerController.getDatePlan);
router.delete('/date-planner', verifyLoveToken, datePlannerController.deleteDatePlan);
// Add this import at the top


// Add these routes before module.exports
// --- Bible Study Routes ---
router.get('/bible-study', verifyLoveToken, bibleStudyController.getNotes);
router.post('/bible-study', verifyLoveToken, bibleStudyController.saveNote);
router.delete('/bible-study/:id', verifyLoveToken, bibleStudyController.deleteNote);
module.exports = router; 

