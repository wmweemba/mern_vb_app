const express = require('express');
const router = express.Router();
const fundController = require('../controllers/fundController');
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

// Static paths before dynamic — Express 5 route-ordering gotcha (CLAUDE.md #3).
router.get('/expenses', verifyToken, resolveGroup, checkTrial, fundController.listExpenses);
router.post('/expenses', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer'), fundController.recordExpense);
router.get('/', verifyToken, resolveGroup, checkTrial, fundController.listFunds);
router.put('/:id', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer'), fundController.updateFund);

module.exports = router;
