const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, requireRole('admin'), transactionController.getAllTransactions);
router.get('/:userId', verifyToken, transactionController.getTransactionsByUser);

module.exports = router;