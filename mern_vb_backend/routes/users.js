const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const { checkTrial } = require('../middleware/checkTrial');

router.get('/', verifyToken, resolveGroup, checkTrial, requireRole(['admin', 'treasurer', 'loan_officer']), userController.getUsers);
router.post('/', verifyToken, resolveGroup, checkTrial, requireRole('admin'), userController.createUser);
router.delete('/:id', verifyToken, resolveGroup, checkTrial, requireRole('admin'), userController.deleteUser);
router.put('/:id/password', verifyToken, resolveGroup, checkTrial, userController.changePassword);
router.put('/:id', verifyToken, resolveGroup, checkTrial, requireRole('admin'), userController.updateUser);

module.exports = router;
