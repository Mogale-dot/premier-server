const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");
const requireRole = require("../../middlewares/requireRole");
const { getPlayers, createPlayer, updatePlayer, deletePlayer } = require("./players.controller");

/* =========================================================
   PUBLIC
   ========================================================= */
router.get("/public", getPlayers);   // <-- public reads for Golden Boot

/* =========================================================
   ADMIN
   ========================================================= */
router.get("/", auth, requireRole("admin"), getPlayers);
router.post("/", auth, requireRole("admin"), createPlayer);
router.put("/:id", auth, requireRole("admin"), updatePlayer);
router.delete("/:id", auth, requireRole("admin"), deletePlayer);

module.exports = router;