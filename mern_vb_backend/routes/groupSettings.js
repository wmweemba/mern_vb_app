const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const groupSettingsController = require('../controllers/groupSettingsController');

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

// Any authenticated user can read settings
router.get('/', verifyToken, groupSettingsController.getGroupSettings);

// Only admin can update settings
router.put('/', verifyToken, allowRoles('admin'), groupSettingsController.updateGroupSettings);

module.exports = router;
