const BankBalance = require('../models/BankBalance');

// Get current bank balance
exports.getBankBalance = async (req, res) => {
  try {
    let doc = await BankBalance.findOne();
    if (!doc) {
      doc = await BankBalance.create({ balance: 0 });
    }
    res.json({ balance: doc.balance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bank balance', details: err.message });
  }
};

// Set bank balance (admin only)
exports.setBankBalance = async (req, res) => {
  try {
    const { balance } = req.body;
    if (typeof balance !== 'number') return res.status(400).json({ error: 'Balance must be a number' });
    let doc = await BankBalance.findOne();
    if (!doc) {
      doc = await BankBalance.create({ balance });
    } else {
      doc.balance = balance;
      await doc.save();
    }
    res.json({ balance: doc.balance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set bank balance', details: err.message });
  }
};

// Internal helper to update balance by amount (positive or negative)
exports.updateBankBalance = async (amount) => {
  let doc = await BankBalance.findOne();
  if (!doc) {
    doc = await BankBalance.create({ balance: 0 });
  }
  amount = Number(amount);
  if (isNaN(amount)) amount = 0;
  doc.balance += amount;
  await doc.save();
  return doc.balance;
}; 