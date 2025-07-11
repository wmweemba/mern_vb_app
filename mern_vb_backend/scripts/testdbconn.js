// test-connection.js
require('dotenv').config();
const mongoose = require('mongoose');

const clientOptions = {
  serverApi: {
    version: '1',
    strict: true,
    deprecationErrors: true
  }
};

async function testConnection() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, clientOptions);
    await mongoose.connection.db.admin().command({ ping: 1 });
    console.log("✅ Success: Connected and pinged MongoDB Atlas!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error connecting to MongoDB Atlas:", error);
    process.exit(1);
  }
}

testConnection();

// This script tests the connection to the MongoDB Atlas database.
// Use the command >pnpm exec node scripts/testdbconn.js in the terminal or command prompt to run it.