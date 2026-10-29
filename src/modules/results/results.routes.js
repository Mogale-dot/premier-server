const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");
const requireRole = require("../../middlewares/requireRole");
const {
  getMatchList,
  getStandings,
  recordResult,
  getTeamPlayers,
  getTournamentStage,
} = require("./results.controller");


router.get("/public/standings", getStandings);
router.get("/public/matches", getMatchList);
router.get("/public/stage", getTournamentStage);


router.get("/", auth, requireRole("admin"), getMatchList);
router.get("/standings", auth, requireRole("admin"), getStandings);
router.get("/stage", auth, requireRole("admin"), getTournamentStage);
router.put("/:id", auth, requireRole("admin"), recordResult);
router.get("/players/:teamId", auth, requireRole("admin"), getTeamPlayers);

module.exports = router;