require('dotenv').config();
const mongoose = require('mongoose');
const SuperAdmin = require('../models/SuperAdmin');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

async function seed() {
  const clerkUserId = process.env.SUPER_ADMIN_CLERK_ID;
  const email = process.env.SUPER_ADMIN_EMAIL;

  if (!clerkUserId || !email) {
    console.error('Set SUPER_ADMIN_CLERK_ID and SUPER_ADMIN_EMAIL in .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, clientOptions);

  const existing = await SuperAdmin.findOne({ clerkUserId });
  if (existing) {
    console.log('SuperAdmin already exists:', existing.email);
  } else {
    await SuperAdmin.create({ clerkUserId, email });
    console.log('SuperAdmin created:', email);
  }

  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
