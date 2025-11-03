const mongoose = require('mongoose');

const ApprovePayingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  historyId: { type: mongoose.Schema.Types.ObjectId, ref: 'HistoryBanking' },
  approved: { type: Boolean, default: false },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  approvedAt: { type: Date }
});

module.exports = mongoose.model('ApprovePaying', ApprovePayingSchema);
