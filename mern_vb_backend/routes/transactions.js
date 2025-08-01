const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { verifyToken, requireRole } = require('../middleware/auth');

// router.get('/', verifyToken, transactionController.getAllTransactions);
// router.get('/:userId', verifyToken, transactionController.getTransactionsByUser);
// router.get('/export', verifyToken, transactionController.exportTransactionsReport);
// router.get('/export/pdf', verifyToken, transactionController.exportTransactionsReportPDF);

router.get('/export', verifyToken, transactionController.exportTransactionsReport);
// router.get('/export/pdf', verifyToken, transactionController.exportTransactionsReportPDF);
router.get('/', verifyToken, transactionController.getAllTransactions);
router.get('/:userId', verifyToken, transactionController.getTransactionsByUser);


module.exports = router;