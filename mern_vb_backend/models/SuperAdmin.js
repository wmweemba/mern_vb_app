const mongoose = require('mongoose');

const superAdminSchema = new mongoose.Schema({
  clerkUserId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('SuperAdmin', superAdminSchema);
