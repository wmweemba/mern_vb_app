const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const supportController = require('../controllers/supportController');

// No checkTrial — expired-trial users must still be able to file tickets.
router.post('/request', verifyToken, resolveGroup, supportController.createRequest);

// No checkTrial here either — an expired user must still be able to read
// and reply to their own tickets. Static routes before the dynamic /:id one.
router.get('/requests', verifyToken, resolveGroup, supportController.listMyRequests);
router.get('/requests/:id', verifyToken, resolveGroup, supportController.getMyRequest);
router.post('/requests/:id/messages', verifyToken, resolveGroup, supportController.addUserMessage);

module.exports = router;
