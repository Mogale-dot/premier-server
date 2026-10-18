const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");
const requireRole = require("../../middlewares/requireRole");
const {
  scanMember,
  memberStatus,
  recentScans,
  insideCount,
} = require("./gate.controller");

/* All gate routes require admin or staff role */
router.use(auth);
router.use(requireRole("admin"));

/* Live scan — toggles member in/out */
router.post("/scan", scanMember);

/* Status lookup (no toggle) */
router.get("/member/:qrToken", memberStatus);

/* Recent scan log */
router.get("/recent", recentScans);

/* Live headcount */
router.get("/inside-count", insideCount);

module.exports = router;