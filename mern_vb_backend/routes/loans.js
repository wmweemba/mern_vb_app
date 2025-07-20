const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Allow both admin and loan_officer to create loans
const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

router.post('/', verifyToken, allowRoles('admin', 'loan_officer'), loanController.createLoan);
router.get('/user/:id', verifyToken, loanController.getLoansByUser);
router.get('/', verifyToken, loanController.getAllLoans);
router.put('/repay', verifyToken, requireRole('loan_officer'), loanController.repayInstallment);
router.get('/export', verifyToken, loanController.exportLoansReport);

module.exports = router;