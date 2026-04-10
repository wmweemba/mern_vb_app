const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const inviteController = require('../controllers/inviteController');

// Treasurer/admin generates invite link (requires group context)
router.post('/', verifyToken, resolveGroup, inviteController.createInvite);
router.get('/', verifyToken, resolveGroup, inviteController.getInvites);

// Member accepts invite (Clerk-authenticated but NO resolveGroup — they don't have a group yet)
router.post('/accept', verifyToken, inviteController.acceptInvite);

// Clerk email-based invites
router.post('/email', verifyToken, resolveGroup, inviteController.inviteByEmail);
router.get('/pending', verifyToken, resolveGroup, inviteController.getPendingInvites);

module.exports = router;
