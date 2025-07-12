const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, requireRole('admin'), userController.getUsers);
router.post('/', verifyToken, requireRole('admin'), userController.createUser);
router.delete('/:id', verifyToken, requireRole('admin'), userController.deleteUser);
router.put('/:id/password', verifyToken, userController.changePassword);
router.put('/:id', verifyToken, requireRole('admin'), userController.updateUser);

module.exports = router;