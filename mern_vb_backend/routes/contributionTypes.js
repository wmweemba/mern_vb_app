const express = require('express');
const router = express.Router();
const contributionTypeController = require('../controllers/contributionTypeController');
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

// Static routes before /:id (Express 5 ordering)
router.post('/', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer'), contributionTypeController.createType);
router.get('/', verifyToken, resolveGroup, checkTrial, contributionTypeController.listTypes);
router.patch('/:id', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer'), contributionTypeController.updateType);

module.exports = router;
