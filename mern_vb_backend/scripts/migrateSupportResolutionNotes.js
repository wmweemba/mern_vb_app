/**
 * Idempotent backfill: for every SupportRequest with a legacy resolutionNote
 * and no messages yet, migrates that note in as the first admin message so
 * an operator's reply history is not lost when resolutionNote is deprecated.
 *
 * Safe to re-run: only tickets with messages.length === 0 are touched, so a
 * ticket already migrated (messages.length >= 1) is skipped on subsequent runs.
 *
 * Usage: node scripts/migrateSupportResolutionNotes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const SupportRequest = require('../models/SupportRequest');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🔗 Connected to MongoDB\n');

  const candidates = await SupportRequest.find({
    resolutionNote: { $ne: null },
    $or: [{ messages: { $exists: false } }, { messages: { $size: 0 } }],
  });

  console.log(`Found ${candidates.length} ticket(s) with an un-migrated resolutionNote\n`);

  let migrated = 0;
  for (const ticket of candidates) {
    ticket.messages.push({
      authorType: 'admin',
      authorId: ticket.resolvedBy || 'system',
      authorName: 'Support Team',
      body: ticket.resolutionNote,
      createdAt: ticket.resolvedAt || ticket.updatedAt || ticket.createdAt,
    });
    await ticket.save();
    migrated++;
    console.log(`  ✅ Migrated resolutionNote for ticket ${ticket._id}`);
  }

  console.log(`\n✅ Done. Migrated: ${migrated}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
