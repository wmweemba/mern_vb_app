const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');
const {
  generateEnhancedReport,
  getAvailableCyclesForReports
} = require('../controllers/enhancedReportsController');
const {
  getInterestObligationReport,
  getMyInterestObligation
} = require('../controllers/interestObligationController');

// Get available cycles for reports
router.get('/cycles', verifyToken, resolveGroup, checkTrial, getAvailableCyclesForReports);

// Generate enhanced reports with cycle support
router.get('/enhanced', verifyToken, resolveGroup, checkTrial, generateEnhancedReport);

// Interest obligation quota (docs/plan_configurable_group_rules.md Phase 3) — self-serve
// route must stay above the general one only if it were a param route; kept adjacent
// for readability.
router.get('/interest-obligation/me', verifyToken, resolveGroup, checkTrial, getMyInterestObligation);
router.get('/interest-obligation', verifyToken, resolveGroup, checkTrial, requireRole(['admin', 'treasurer', 'loan_officer']), getInterestObligationReport);

module.exports = router;
