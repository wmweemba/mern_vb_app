const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const controller = require('../controllers/subscriptionPaymentController');

// Group-facing Lipila billing routes. Deliberately NOT behind checkTrial — an
// expired-trial or lapsed-paid group must still be able to pay. requireRole
// takes an ARRAY, it is not variadic (middleware/auth.js).
router.post('/initiate', verifyToken, resolveGroup, requireRole(['admin', 'treasurer']), controller.initiate);

module.exports = router;
