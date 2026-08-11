const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const groupSettingsController = require('../controllers/groupSettingsController');

// No resolveGroup/checkTrial — this is read during onboarding, before a group exists.
router.get('/', verifyToken, groupSettingsController.listGroupTemplates);

module.exports = router;
