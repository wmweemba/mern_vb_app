const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.post('/repayment', verifyToken, requireRole('admin'), paymentController.repayment);
router.post('/payout', verifyToken, requireRole('admin'), paymentController.payout);

module.exports = router; 