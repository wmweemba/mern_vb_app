const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');

const platform = require('../controllers/platformAdminController');
const groups = require('../controllers/adminGroupsController');
const settings = require('../controllers/adminGroupSettingsController');
const billing = require('../controllers/adminBillingController');
const members = require('../controllers/adminMembersController');
const superAdmins = require('../controllers/superAdminController');
const supportController = require('../controllers/supportController');

// Public-ish: accept-invite only requires Clerk auth, not super-admin status
router.post('/super-admins/accept-invite', verifyToken, superAdmins.acceptInvite);

// All routes below require super admin
router.use(verifyToken, requireSuperAdmin);

// Overview, audit, diagnostics
router.get('/overview', platform.overview);
router.get('/audit-log', platform.auditLog);
router.post('/test-email', platform.testEmail);

// Groups
router.get('/groups', groups.listGroups);
router.post('/groups', groups.createGroup);
router.get('/groups/:groupId', groups.getGroup);
router.patch('/groups/:groupId', groups.updateGroup);
router.delete('/groups/:groupId', groups.softDeleteGroup);
router.post('/groups/:groupId/restore', groups.restoreGroup);
router.post('/groups/:groupId/suspend', groups.suspendGroup);
router.post('/groups/:groupId/unsuspend', groups.unsuspendGroup);

// Group settings
router.get('/groups/:groupId/settings', settings.getSettings);
router.patch('/groups/:groupId/settings', settings.updateSettings);

// Billing
router.get('/billing/plans', billing.listPlans);
router.post('/groups/:groupId/billing/activate', billing.activate);
router.post('/groups/:groupId/billing/mark-unpaid', billing.markUnpaid);

// Members per group
router.get('/groups/:groupId/members', members.listMembers);
router.patch('/groups/:groupId/members/:memberId', members.updateMember);
router.delete('/groups/:groupId/members/:memberId', members.softDeleteMember);
router.post('/groups/:groupId/members/:memberId/restore', members.restoreMember);

// Super admins
router.get('/super-admins', superAdmins.list);
router.post('/super-admins/invite', superAdmins.invite);
router.delete('/super-admins/:id', superAdmins.revoke);

// Support inbox
router.get('/support', supportController.listRequests);
router.patch('/support/:id', supportController.updateStatus);

module.exports = router;
