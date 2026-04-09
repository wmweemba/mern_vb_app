const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const groupController = require('../controllers/groupController');

router.post('/', verifyToken, groupController.createGroup);

module.exports = router;
