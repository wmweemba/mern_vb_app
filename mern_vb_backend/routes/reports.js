const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { 
  generateEnhancedReport, 
  getAvailableCyclesForReports
} = require('../controllers/enhancedReportsController');

// Get available cycles for reports
router.get('/cycles', verifyToken, getAvailableCyclesForReports);

// Generate enhanced reports with cycle support
router.get('/enhanced', verifyToken, generateEnhancedReport);

module.exports = router;