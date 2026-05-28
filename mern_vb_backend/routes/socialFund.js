const express = require('express');
const router = express.Router();
const socialFundController = require('../controllers/socialFundController');
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

// Static paths — no /:id collision risk at this scope
router.get('/balance', verifyToken, resolveGroup, checkTrial, socialFundController.getBalance);
router.post('/expenses', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer'), socialFundController.recordExpense);
router.get('/expenses', verifyToken, resolveGroup, checkTrial, socialFundController.listExpenses);

module.exports = router;
