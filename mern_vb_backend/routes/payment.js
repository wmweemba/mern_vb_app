const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

router.post('/repayment', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.repayment);
router.post('/payout', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.payout);
router.post('/fine', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.fine);
router.post('/pay-fine', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.payFine);
router.get('/unpaid-fines', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.getUnpaidFines);
router.get('/fines', verifyToken, resolveGroup, checkTrial, paymentController.getAllFines);
router.patch('/fines/:fineId', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.editFine);
router.put('/fines/:fineId/void', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.voidFine);
router.delete('/fines/:fineId', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer', 'loan_officer'), paymentController.deleteFine);
router.delete('/fines', verifyToken, resolveGroup, checkTrial, requireRole('admin'), paymentController.deleteAllFines);

module.exports = router;
