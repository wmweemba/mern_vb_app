const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const billingController = require('../controllers/billingController');

router.get('/plans', verifyToken, billingController.listPlans);
router.post('/request', verifyToken, billingController.requestUpgrade);

module.exports = router;
