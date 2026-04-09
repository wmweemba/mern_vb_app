const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const adminController = require('../controllers/adminController');

router.get('/groups', verifyToken, resolveGroup, adminController.listGroups);
router.get('/groups/:groupId', verifyToken, resolveGroup, adminController.getGroup);

module.exports = router;
