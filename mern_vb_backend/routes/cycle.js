const express = require('express');
const router = express.Router();
const cycleController = require('../controllers/cycleController');
const { verifyToken } = require('../middleware/auth');

// Begin new cycle - admin, treasurer, loan_officer only
router.post('/begin-new-cycle', verifyToken, cycleController.beginNewCycle);

// Get historical reports
router.get('/historical-reports', verifyToken, cycleController.getHistoricalReports);

// Get available cycles
router.get('/available-cycles', verifyToken, cycleController.getAvailableCycles);

module.exports = router;