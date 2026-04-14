const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');
const {
  generateEnhancedReport,
  getAvailableCyclesForReports
} = require('../controllers/enhancedReportsController');

// Get available cycles for reports
router.get('/cycles', verifyToken, resolveGroup, checkTrial, getAvailableCyclesForReports);

// Generate enhanced reports with cycle support
router.get('/enhanced', verifyToken, resolveGroup, checkTrial, generateEnhancedReport);

module.exports = router;
