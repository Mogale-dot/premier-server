const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");
const {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
} = require("./tasks.controller");

// All routes require authentication
router.use(auth);

// GET /api/dashboard/tasks
router.get("/", getAllTasks);

// GET /api/dashboard/tasks/:id
router.get("/:id", getTaskById);

// POST /api/dashboard/tasks
router.post("/", createTask);

// PUT /api/dashboard/tasks/:id
router.put("/:id", updateTask);

// PATCH /api/dashboard/tasks/:id/status
router.put("/:id/status", updateTaskStatus);

// DELETE /api/dashboard/tasks/:id
router.delete("/:id", deleteTask);

module.exports = router;