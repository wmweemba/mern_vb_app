const express = require('express');
const router = express.Router();
const bankBalanceController = require('../controllers/bankBalanceController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, bankBalanceController.getBankBalance);
router.put('/', verifyToken, requireRole('admin'), bankBalanceController.setBankBalance);
router.get('/fines', verifyToken, bankBalanceController.getTotalFines);

module.exports = router; 