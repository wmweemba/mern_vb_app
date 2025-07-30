const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken, requireRole } = require('../middleware/auth');

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

router.post('/repayment', verifyToken, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.repayment);
router.post('/payout', verifyToken, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.payout);
router.post('/fine', verifyToken, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.fine);
router.post('/pay-fine', verifyToken, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.payFine);
router.get('/unpaid-fines', verifyToken, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.getUnpaidFines);
router.delete('/fines', verifyToken, requireRole('admin'), paymentController.deleteAllFines);

module.exports = router; 