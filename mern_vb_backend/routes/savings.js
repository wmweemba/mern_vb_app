// routes/savings.js
const express = require('express');
const router = express.Router();
const savingsController = require('../controllers/savingsController');
const thresholdController = require('../controllers/thresholdController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

// Savings routes
router.post('/', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'loan_officer'), savingsController.createSaving);
router.get('/', verifyToken, resolveGroup, checkTrial, savingsController.getAllSavings);
router.get('/user/:id', verifyToken, resolveGroup, checkTrial, savingsController.getSavingsByUser);
router.put('/:savingId', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'loan_officer', 'treasurer'), savingsController.updateSaving);
router.get('/export', verifyToken, resolveGroup, checkTrial, savingsController.exportSavingsReport);
// router.get('/export/pdf', verifyToken, resolveGroup, checkTrial, savingsController.exportSavingsReportPDF);
router.get('/dashboard', verifyToken, resolveGroup, checkTrial, savingsController.getDashboardStats);

// Threshold routes
router.post('/thresholds', verifyToken, resolveGroup, checkTrial, requireRole('admin'), thresholdController.createThreshold);
router.get('/thresholds/latest', verifyToken, resolveGroup, checkTrial, thresholdController.getLatestThreshold);

module.exports = router;
