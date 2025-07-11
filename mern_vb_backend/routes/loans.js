const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.post('/', verifyToken, requireRole('loan_officer'), loanController.createLoan);
router.get('/user/:id', verifyToken, loanController.getLoansByUser);
router.put('/repay', verifyToken, requireRole('loan_officer'), loanController.repayInstallment);
router.get('/export', verifyToken, loanController.exportLoansReport);

module.exports = router;