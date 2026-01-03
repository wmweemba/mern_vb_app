const mongoose = require('mongoose');

const savingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: Number, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    fine: { type: Number, default: 0 },
    interestEarned: { type: Number, default: 0 },
    cycleNumber: { type: Number },
    cycleEndDate: { type: Date },
    archived: { type: Boolean, default: false }
});

module.exports = mongoose.model('Saving', savingSchema);