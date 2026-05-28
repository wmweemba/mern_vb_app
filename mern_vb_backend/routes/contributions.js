const express = require('express');
const router = express.Router();
const contributionController = require('../controllers/contributionController');
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

router.post('/', verifyToken, resolveGroup, checkTrial, allowRoles('admin', 'treasurer', 'loan_officer'), contributionController.recordContribution);
router.get('/', verifyToken, resolveGroup, checkTrial, contributionController.listContributions);

module.exports = router;
