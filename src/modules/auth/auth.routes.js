const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");
const {
  signup,
  login,
  googleAuth,
  refreshToken,
  logout,
  getMe,
  changePassword,
} = require("./auth.controller");

// Public
router.post("/signup", signup);
router.post("/login", login);
router.post("/google", googleAuth);
router.post("/refresh", refreshToken);

// Protected
router.post("/logout", auth, logout);
router.get("/me", auth, getMe);
router.post("/change-password", auth, changePassword);

module.exports = router;