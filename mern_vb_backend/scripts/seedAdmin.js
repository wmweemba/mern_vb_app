require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function seedAdmin() {
  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await User.findOne({ username: 'admin' });
  if (existing) {
    console.log('Admin user already exists');
    return process.exit();
  }

  const passwordHash = await bcrypt.hash('vbadmin', 10);
  const admin = new User({
    username: 'admin',
    passwordHash,
    role: 'admin',
    name: 'System Admin',
    email: 'admin@vb.com',
    phone: '260000000000',
  });

  await admin.save();
  console.log('✅ Admin user created');
  process.exit();
}

seedAdmin().catch(err => {
  console.error(err);
  process.exit(1);
});


// This script creates an admin user with the username 'admin' and the password 'vbadmin'
// Use the command >pnpm exec node scripts/seedAdmin.js in the terminal or command prompt to run it.
