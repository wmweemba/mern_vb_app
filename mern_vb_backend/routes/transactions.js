const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');

router.get('/export', verifyToken, resolveGroup, checkTrial, transactionController.exportTransactionsReport);
router.get('/', verifyToken, resolveGroup, checkTrial, transactionController.getAllTransactions);
router.get('/:userId', verifyToken, resolveGroup, checkTrial, transactionController.getTransactionsByUser);

module.exports = router;
