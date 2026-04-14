const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');
const groupSettingsController = require('../controllers/groupSettingsController');

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

// Any authenticated user can read settings
router.get('/', verifyToken, resolveGroup, checkTrial, groupSettingsController.getGroupSettings);

// Only admin can update settings
router.put('/', verifyToken, resolveGroup, checkTrial, allowRoles('admin'), groupSettingsController.updateGroupSettings);

module.exports = router;
