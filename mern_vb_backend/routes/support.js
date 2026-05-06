const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const supportController = require('../controllers/supportController');

// No checkTrial — expired-trial users must still be able to file tickets.
router.post('/request', verifyToken, resolveGroup, supportController.createRequest);

module.exports = router;
