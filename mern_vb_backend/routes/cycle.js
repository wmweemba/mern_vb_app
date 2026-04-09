const express = require('express');
const router = express.Router();
const cycleController = require('../controllers/cycleController');
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');

// Begin new cycle - admin, treasurer, loan_officer only
router.post('/begin-new-cycle', verifyToken, resolveGroup, checkTrial, cycleController.beginNewCycle);

// Get historical reports
router.get('/historical-reports', verifyToken, resolveGroup, checkTrial, cycleController.getHistoricalReports);

// Get available cycles
router.get('/available-cycles', verifyToken, resolveGroup, checkTrial, cycleController.getAvailableCycles);

module.exports = router;
