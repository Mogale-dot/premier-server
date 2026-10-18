const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");
const {
  getModerationStats,
  getReports,
  handleReportAction,
  getBlockedSalons,
  unblockSalon,
  getHiddenPosts,
  getPostById,
} = require("./moderation.controller");

// Stats
router.get("/stats", auth, getModerationStats);

// Reports
router.get("/reports", auth, getReports);
router.post("/reports/:reportId/action", auth, handleReportAction);

// Blocked Salons
router.get("/blocked-salons", auth, getBlockedSalons);
router.delete("/blocked-salons/:blockId", auth, unblockSalon);

// Hidden Posts
router.get("/hidden-posts", auth, getHiddenPosts); 
// In modules/feed/feed.routes.js
router.get("/posts/:postId", auth, getPostById);

module.exports = router;