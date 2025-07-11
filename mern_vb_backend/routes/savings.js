// routes/savings.js
const express = require('express');
const router = express.Router();
const savingsController = require('../controllers/savingsController');
const thresholdController = require('../controllers/thresholdController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Savings routes
router.post('/', verifyToken, requireRole('loan_officer'), savingsController.createSaving);
router.get('/user/:id', verifyToken, savingsController.getSavingsByUser);
router.get('/export', verifyToken, savingsController.exportSavingsReport);
router.get('/dashboard', verifyToken, requireRole('admin'), savingsController.getDashboardStats);

// Threshold routes
router.post('/thresholds', verifyToken, requireRole('admin'), thresholdController.createThreshold);
router.get('/thresholds/latest', verifyToken, thresholdController.getLatestThreshold);

module.exports = router;
