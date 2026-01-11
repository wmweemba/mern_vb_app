const express = require('express');
const router = express.Router();
const bankBalanceController = require('../controllers/bankBalanceController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Allow admin, treasurer, and loan_officer to manage bank balance
const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

router.get('/', verifyToken, bankBalanceController.getBankBalance);
router.put('/', verifyToken, allowRoles('admin', 'treasurer', 'loan_officer'), bankBalanceController.setBankBalance);
router.get('/fines', verifyToken, bankBalanceController.getTotalFines);

module.exports = router; 