require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function seedTestDev() {
  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await User.findOne({ username: 'test' });
  if (existing) {
    console.log('Test dev user already exists');
    return process.exit();
  }

  const passwordHash = await bcrypt.hash('vbtest', 10);
  const testUser = new User({
    username: 'test',
    passwordHash,
    role: 'admin',
    name: 'Test Developer',
    email: 'testdev@vb.com',
    phone: '260111111111',
  });

  await testUser.save();
  console.log('✅ Test dev user created (username: test, password: vbtest)');
  process.exit();
}

seedTestDev().catch(err => {
  console.error(err);
  process.exit(1);
});

// This script creates a test development user with the username 'test' and the password 'vbtest'
// Use the command: node scripts/seedTestDev.js in the mern_vb_backend directory to run it.