const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");
const requireRole = require("../../middlewares/requireRole");
const { getDashboardStats } = require("./admin.controller");

// Only admins can access dashboard stats
router.use(auth);
router.use(requireRole("admin"));

router.get("/dashboard", getDashboardStats);

module.exports = router;