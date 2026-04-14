const express = require('express');
const router = express.Router();
const bankBalanceController = require('../controllers/bankBalanceController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');

// Allow admin, treasurer, and loan_officer to manage bank balance
const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

router.get('/', verifyToken, resolveGroup, checkTrial, bankBalanceController.getBankBalance);
router.put('/', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer', 'loan_officer'), bankBalanceController.setBankBalance);
router.get('/fines', verifyToken, resolveGroup, checkTrial, bankBalanceController.getTotalFines);

module.exports = router;
