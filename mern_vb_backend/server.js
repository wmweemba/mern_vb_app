require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', userRoutes);
app.use('/api/bank-balance', require('./routes/bankBalance'));
app.use('/api/payments', require('./routes/payment'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/savings', require('./routes/savings'));
app.use('/api/loans', require('./routes/loans'));

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
