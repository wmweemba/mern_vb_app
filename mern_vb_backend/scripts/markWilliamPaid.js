require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);
  const result = await Group.updateOne(
    { slug: 'williams-group' },
    { $set: { trialExpiresAt: new Date('2099-12-31'), isPaid: true } }
  );
  console.log('Updated:', result.modifiedCount, 'document(s)');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
