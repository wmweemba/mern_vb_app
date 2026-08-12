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
const {
  getContributionLiabilityReport,
  getMyContributionLiability
} = require('../controllers/contributionLiabilityController');

// Get available cycles for reports
router.get('/cycles', verifyToken, resolveGroup, checkTrial, getAvailableCyclesForReports);

// Generate enhanced reports with cycle support
router.get('/enhanced', verifyToken, resolveGroup, checkTrial, generateEnhancedReport);

// Interest obligation quota (docs/plan_configurable_group_rules.md Phase 3) — self-serve
// route must stay above the general one only if it were a param route; kept adjacent
// for readability.
router.get('/interest-obligation/me', verifyToken, resolveGroup, checkTrial, getMyInterestObligation);
router.get('/interest-obligation', verifyToken, resolveGroup, checkTrial, requireRole(['admin', 'treasurer', 'loan_officer']), getInterestObligationReport);

// Contribution liabilities (docs/plan_configurable_group_rules.md Phase 4) — any
// ContributionType with targetAmountPerMember > 0 (e.g. a membership fee).
router.get('/contribution-liability/me', verifyToken, resolveGroup, checkTrial, getMyContributionLiability);
router.get('/contribution-liability', verifyToken, resolveGroup, checkTrial, requireRole(['admin', 'treasurer', 'loan_officer']), getContributionLiabilityReport);

module.exports = router;
