require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { clerkMiddleware } = require('@clerk/express');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

const app = express();
app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Webhook routes MUST come before express.json() — they need raw body for signature verification
app.use('/api/webhooks', require('./routes/webhookRoutes'));

app.use(express.json());
app.use(clerkMiddleware({ secretKey: process.env.CLERK_SECRET_KEY }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', userRoutes);
app.use('/api/bank-balance', require('./routes/bankBalance'));
app.use('/api/payments', require('./routes/payment'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/savings', require('./routes/savings'));
app.use('/api/loans', require('./routes/loans'));
app.use('/api/cycle', require('./routes/cycle'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/group-settings', require('./routes/groupSettings'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/invites', require('./routes/invites'));
app.use('/api/billing', require('./routes/billingRoutes'));
app.use('/api/admin', require('./routes/admin'));

const clientOptions = {
  serverApi: {
    version: '1',
    strict: true,
    deprecationErrors: true,
  },
};

mongoose.connect(process.env.MONGODB_URI, clientOptions)
  .then(() => {
    console.log("✅ MongoDB Atlas connected");
    app.listen(process.env.PORT || 5000, () => {
      console.log(`🚀 Server running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to MongoDB", err);
  });

module.exports = app;
