const Saving = require('../models/Saving');
const { logTransaction } = require('./transactionController');

exports.createSaving = async (req, res) => {
  const { userId, month, amount, date } = req.body;
  try {
    const savingDate = date ? new Date(date) : new Date();

    let fine = 0;
    let interest = +(amount * 0.10).toFixed(2);

    // Required savings check
    if (month === 1 && amount < 3000) fine = 500;
    else if (month > 1 && amount < 1000) fine = 500;
    else if (month <= 3 && amount > 5000) return res.status(400).json({ error: 'Cannot save more than K5,000 in the first 3 months' });

    const saving = new Saving({
      userId,
      month,
      amount,
      date: savingDate,
      fine,
      interestEarned: interest
    });

    await saving.save();
    await logTransaction({
      userId,
      type: 'saving',
      amount,
      referenceId: saving._id,
      note: `Savings of K${amount} for month ${month}.`
    });
    res.status(201).json(saving);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save contribution', details: err.message });
  }
};

exports.getSavingsByUser = async (req, res) => {
  try {
    const savings = await Saving.find({ userId: req.params.id });
    res.json(savings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch savings' });
  }
};