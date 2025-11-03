const mongoose = require('mongoose');

const HistoryBankingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['in', 'out'], default: 'in' },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  note: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('HistoryBanking', HistoryBankingSchema);
