const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");
const {
  getAllTeamMembers,
  getTeamMemberById,
  createTask,
  updateTaskStatus,
  deleteTask,
  getMemberTasks,
  getTeamStats,
} = require("./team.controller");

// All routes require authentication
router.use(auth);

// Team member management (super admin only)
router.get("/members", getAllTeamMembers);
router.get("/members/:id", getTeamMemberById);
router.get("/stats", getTeamStats);

// Task management
router.post("/tasks", createTask);
router.get("/tasks/:memberId", getMemberTasks);
router.put("/tasks/:taskId/status", updateTaskStatus);
router.delete("/tasks/:taskId", deleteTask);

module.exports = router;