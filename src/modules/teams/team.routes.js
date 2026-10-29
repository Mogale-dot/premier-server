const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");
const requireRole = require("../../middlewares/requireRole");
const {
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  getFixtures,
  createFixture,
  deleteFixture,
  generateGroupFixtures,
} = require("./team.controller");


router.get("/public/fixtures", getFixtures);
router.get("/public/teams", getTeams);        



router.get("/", auth, requireRole("admin"), getTeams);
router.post("/", auth, requireRole("admin"), createTeam);
router.put("/:id", auth, requireRole("admin"), updateTeam);
router.delete("/:id", auth, requireRole("admin"), deleteTeam);

router.get("/fixtures", auth, requireRole("admin"), getFixtures);
router.post("/fixtures", auth, requireRole("admin"), createFixture);
router.delete("/fixtures/:id", auth, requireRole("admin"), deleteFixture);
router.post("/fixtures/generate-groups", auth, requireRole("admin"), generateGroupFixtures);

module.exports = router;