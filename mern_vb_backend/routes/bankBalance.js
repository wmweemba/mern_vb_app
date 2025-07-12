const express = require('express');
const router = express.Router();
const bankBalanceController = require('../controllers/bankBalanceController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, requireRole('admin'), bankBalanceController.getBankBalance);
router.put('/', verifyToken, requireRole('admin'), bankBalanceController.setBankBalance);

module.exports = router; 