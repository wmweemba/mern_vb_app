const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'treasurer', 'loan_officer', 'member'],
    default: 'member'
  },
  name: String,
  email: String,
  phone: String
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);