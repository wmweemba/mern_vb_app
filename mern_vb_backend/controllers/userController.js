const GroupMember = require('../models/GroupMember');

exports.getUsers = async (req, res) => {
  try {
    const members = await GroupMember.find({ ...req.groupScope, active: true, deletedAt: null })
      .select('-clerkUserId');
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// createUser is removed — members are added via the invite flow
exports.createUser = async (req, res) => {
  res.status(410).json({ error: 'Direct user creation is disabled. Use the invite flow instead.' });
};

exports.deleteUser = async (req, res) => {
  try {
    const member = await GroupMember.findOne({ _id: req.params.id, ...req.groupScope });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    member.active = false;
    await member.save();
    res.json({ message: 'Member deactivated' });
  } catch (err) {
    res.status(400).json({ error: 'Failed to deactivate member' });
  }
};

exports.changePassword = async (req, res) => {
  // Password management is now handled by Clerk
  res.status(410).json({ error: 'Password management is handled by Clerk.' });
};

exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, role } = req.body;
  try {
    const member = await GroupMember.findOne({ _id: id, ...req.groupScope });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (name !== undefined) member.name = name;
    if (email !== undefined) member.email = email;
    if (phone !== undefined) member.phone = phone;
    if (role !== undefined) member.role = role;
    await member.save();
    res.json({ message: 'Member updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update member', details: err.message });
  }
};

// Self-service: any authenticated group member can add/update their own
// email. Members can end up with a blank email (e.g. added by an admin, or
// signed up via a flow that didn't collect one) which silently blocks
// email-dependent features like support tickets — this lets them fix it
// themselves instead of needing an admin edit.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.updateMyEmail = async (req, res) => {
  try {
    if (!req.member) {
      return res.status(400).json({ error: 'No group membership found.' });
    }
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    req.member.email = email;
    await req.member.save();
    res.json({ message: 'Email updated successfully', email });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update email', details: err.message });
  }
};
