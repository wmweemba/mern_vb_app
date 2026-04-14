const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const billingController = require('../controllers/billingController');

router.post('/request', verifyToken, billingController.requestUpgrade);

module.exports = router;
