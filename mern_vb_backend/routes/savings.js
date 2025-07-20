// routes/savings.js
const express = require('express');
const router = express.Router();
const savingsController = require('../controllers/savingsController');
const thresholdController = require('../controllers/thresholdController');
const { verifyToken, requireRole } = require('../middleware/auth');

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

// Savings routes
router.post('/', verifyToken, allowRoles('admin', 'loan_officer'), savingsController.createSaving);
router.get('/', verifyToken, savingsController.getAllSavings);
router.get('/user/:id', verifyToken, savingsController.getSavingsByUser);
router.get('/export', verifyToken, savingsController.exportSavingsReport);
router.get('/dashboard', verifyToken, savingsController.getDashboardStats);

// Threshold routes
router.post('/thresholds', verifyToken, requireRole('admin'), thresholdController.createThreshold);
router.get('/thresholds/latest', verifyToken, thresholdController.getLatestThreshold);

module.exports = router;
