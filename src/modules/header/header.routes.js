const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");
const {
  getCurrentUserProfile,
  getLaunchCountdown,
  getNotifications,
  markNotificationRead,
  getTaskProgress, 
} = require("./header.controller");

// All routes require authentication
router.use(auth);

// Profile endpoints
router.get("/profile", getCurrentUserProfile);

// Launch countdown (everyone can see)
router.get("/launch-countdown", getLaunchCountdown); 
// Task progress (super admin or member)
router.get("/task-progress", getTaskProgress);  

// Notifications
router.get("/notifications", getNotifications);
router.post("/notifications/:id/read", markNotificationRead);

module.exports = router;