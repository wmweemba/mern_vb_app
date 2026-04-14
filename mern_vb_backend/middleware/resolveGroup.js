const { getAuth } = require('@clerk/express');
const GroupMember = require('../models/GroupMember');
const SuperAdmin = require('../models/SuperAdmin');

/**
 * Looks up the authenticated Clerk user's GroupMember record.
 * Checks SuperAdmin first — super admins bypass group membership.
 * Attaches to req: groupId, memberId, role, member, groupScope.
 *
 * Mount AFTER verifyToken on all group-scoped routes.
 * If the user has no GroupMember record, returns 403 with onboarding flag.
 */
async function resolveGroup(req, res, next) {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check super admin first
    const superAdmin = await SuperAdmin.findOne({ clerkUserId });
    if (superAdmin) {
      req.isSuperAdmin = true;
      // Super admin may also be a group member — resolve their group so they
      // can use the app as a normal user for their own group.
      const member = await GroupMember.findOne({ clerkUserId, active: true });
      if (member) {
        req.groupId = member.groupId;
        req.memberId = member._id;
        req.role = member.role;
        req.member = member;
        req.groupScope = { groupId: member.groupId };
        req.user = { id: member._id, role: member.role, groupId: member.groupId };
      } else {
        req.user = { id: null, role: 'admin', groupId: null };
      }
      return next();
    }

    const member = await GroupMember.findOne({ clerkUserId, active: true });
    if (!member) {
      return res.status(403).json({
        error: 'No group membership found',
        code: 'NO_GROUP',
      });
    }

    req.groupId = member.groupId;
    req.memberId = member._id;
    req.role = member.role;
    req.member = member;
    req.groupScope = { groupId: member.groupId };

    // Backward compat: controllers that check req.user.role still work
    req.user = { id: member._id, role: member.role, groupId: member.groupId };

    next();
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve group', details: err.message });
  }
}

module.exports = { resolveGroup };
