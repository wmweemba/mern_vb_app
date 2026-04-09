const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');

// Allow both admin and loan_officer to create loans
const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

router.post('/', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'loan_officer'), loanController.createLoan);
router.get('/user/:id', verifyToken, resolveGroup, checkTrial, loanController.getLoansByUser);
router.get('/export', verifyToken, resolveGroup, checkTrial, loanController.exportLoansReport);
router.get('/export/pdf', verifyToken, resolveGroup, checkTrial, loanController.exportLoansReportPDF);
router.get('/', verifyToken, resolveGroup, checkTrial, loanController.getAllLoans);
router.put('/repay', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'loan_officer', 'treasurer'), loanController.repayInstallment);
router.put('/:loanId', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'loan_officer', 'treasurer'), loanController.updateLoan);
router.put('/:loanId/installments/:month/reverse', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'loan_officer', 'treasurer'), loanController.reverseInstallmentPayment);
router.delete('/:loanId', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'loan_officer'), loanController.deleteLoan);

module.exports = router;
