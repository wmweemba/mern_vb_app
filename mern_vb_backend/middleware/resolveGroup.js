const { getAuth } = require('@clerk/express');
const GroupMember = require('../models/GroupMember');
const SuperAdmin = require('../models/SuperAdmin');
const Group = require('../models/Group');

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

    // Check super admin first (only non-revoked)
    const superAdmin = await SuperAdmin.findOne({ clerkUserId, revokedAt: null });
    if (superAdmin) {
      req.isSuperAdmin = true;
      // A super admin may ALSO be an ordinary member of a group, in which case they
      // can use the app normally for that group. If they are not, this middleware
      // must FAIL CLOSED — see below.
      const member = await GroupMember.findOne({ clerkUserId, active: true, deletedAt: null });

      // Fail closed. Previously this branch called next() with req.groupId and
      // req.groupScope left undefined, and controllers do `find({ ...req.groupScope })`.
      // Spreading undefined yields {}, and Mongoose drops undefined keys from a query —
      // so every group-scoped read returned the entire collection, and
      // cycleController.resetForNewCycle's `deleteMany({ groupId, archived: {$ne: true} })`
      // would have deleted every non-archived Loan/Saving/Fine in the database.
      // Went live 2026-09-09 when the super admin's own group was hard-deleted, which
      // removed their GroupMember record and made this the first request to take the
      // else-branch. A super admin with no membership now gets the same NO_GROUP
      // response as any other user without one.
      // Safe: no route in routes/admin.js mounts resolveGroup — the Platform Admin
      // panel authenticates via requireSuperAdmin and is unaffected.
      if (!member) {
        return res.status(403).json({
          error: 'No group membership found — super admin access is via the admin panel',
          code: 'NO_GROUP',
        });
      }

      const superGroup = await Group.findById(member.groupId);
      if (!superGroup || superGroup.deletedAt) {
        return res.status(403).json({ error: 'Group has been deleted', code: 'GROUP_DELETED' });
      }

      req.groupId = member.groupId;
      req.memberId = member._id;
      req.role = member.role;
      req.member = member;
      req.groupScope = { groupId: member.groupId };
      req.user = { id: member._id, role: member.role, groupId: member.groupId };
      return next();
    }

    const member = await GroupMember.findOne({ clerkUserId, active: true, deletedAt: null });
    if (!member) {
      return res.status(403).json({
        error: 'No group membership found',
        code: 'NO_GROUP',
      });
    }

    // Check that the group is not deleted or suspended
    const group = await Group.findById(member.groupId);
    if (!group || group.deletedAt) {
      return res.status(403).json({ error: 'Group has been deleted', code: 'GROUP_DELETED' });
    }
    if (group.suspendedAt) {
      return res.status(403).json({ error: 'Group is suspended', code: 'GROUP_SUSPENDED' });
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
