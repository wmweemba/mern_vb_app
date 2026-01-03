require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function resetAdminPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    // Find the admin user
    const admin = await User.findOne({ username: 'admin' });
    if (!admin) {
      console.log('❌ Admin user not found. Please run seedAdmin.js first to create an admin user.');
      return process.exit(1);
    }

    // Hash the new password "Default"
    const newPasswordHash = await bcrypt.hash('Default', 10);
    
    // Update the admin password
    admin.passwordHash = newPasswordHash;
    await admin.save();

    console.log('✅ Admin password has been reset to "Default"');
    console.log('👤 Username: admin');
    console.log('🔑 Password: Default');
    console.log('');
    console.log('Please log in and change your password immediately for security.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting admin password:', error.message);
    process.exit(1);
  }
}

resetAdminPassword();