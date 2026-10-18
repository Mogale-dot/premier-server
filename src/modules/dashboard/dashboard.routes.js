const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");

// Import controllers
const {
  getAllUsers,
  getUserById,
  deleteUser,
  updateUserRole,
} = require("./users.controller");

const {
  getAllSalons,
  getSalonById,
  deleteSalon,
  updateSalonStatus,
} = require("./salons.controller"); 

const { getOverviewStats, getRecentActivity } = require("./overview.controller");

// Overview endpoints
router.get("/overview/stats", auth, getOverviewStats);
router.get("/overview/recent-activity", auth, getRecentActivity);



// Overview endpoints
router.get("/overview/stats", auth, getOverviewStats);
router.get("/overview/recent-activity", auth, getRecentActivity);
// ========== USERS MANAGEMENT ==========
router.get("/users", auth, getAllUsers);
router.get("/users/:id", auth, getUserById);
router.delete("/users/:id", auth, deleteUser);
router.put("/users/:id/role", auth, updateUserRole);

// ========== SALONS MANAGEMENT ==========
router.get("/salons", auth, getAllSalons);
router.get("/salons/:id", auth, getSalonById);
router.delete("/salons/:id", auth, deleteSalon);
router.put("/salons/:id", auth, updateSalonStatus); 



module.exports = router;