const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const { getAuth } = require('@clerk/express');

router.get('/me', verifyToken, authController.me);

// Auth diagnostic — remove after 401 bug is confirmed fixed
router.get('/test', verifyToken, (req, res) => {
  const { userId } = getAuth(req);
  res.json({ ok: true, clerkUserId: userId });
});

module.exports = router;
