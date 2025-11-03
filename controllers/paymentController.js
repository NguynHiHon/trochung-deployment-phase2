const Wallet = require('../models/Wallet');
const HistoryBanking = require('../models/HistoryBanking');
const ApprovePaying = require('../models/ApprovePaying');
const Post = require('../models/Post');
const IsLandor = require('../models/IsLandor');

// Return bank account info and create a pending history entry
exports.createPaymentRequest = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { amount } = req.body || {};
    const numeric = Number(amount) || 0;

    // create pending history entry
    const noteTime = new Date();
    const content = `User ${userId} mua ${numeric} Xu vào lúc ${noteTime.toISOString()}`;

    const hist = await HistoryBanking.create({ user: userId, amount: numeric, type: 'in', status: 'pending', note: content });

    // bank info from env
  const bankAccount = process.env.BANK_ACCOUNT || '000000000';
  const bankName = process.env.BANK_NAME || 'Ngân hàng mặc định';
  const bankCode = process.env.BANK_CODE || '';

  // simple vietqr payload-like string (frontend may render using vietqr lib)
  const vietqrPayload = `STK:${bankAccount};BANK:${bankName};AMOUNT:${numeric};CONTENT:${content}`;

  // Build VietQR image URL using environment variables following the canonical template:
  // https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-<TEMPLATE>.png?amount=<AMOUNT>&addInfo=<DESCRIPTION>&accountName=<ACCOUNT_NAME>
  const bankId = process.env.BANK_ID || bankCode || '';
  const accountNo = process.env.ACCOUNT_NO || bankAccount;
  const template = process.env.BANK_TEMPLATE || 'compact';
  const accountName = process.env.BANK_ACCOUNT_NAME || process.env.BANK_NAME || '';
  const vietqrImageUrl = bankId ? `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${numeric}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(accountName)}` : null;

  // create approve entry for admin to review and link to the history record

  return res.json({ success: true, data: { bankAccount, bankName, bankCode, content, amount: numeric, time: noteTime, vietqrPayload, vietqrImageUrl, historyId: hist._id } });
  } catch (err) {
    console.error('createPaymentRequest error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// User: create an approve paying request (admin will review)
exports.createApproveRequest = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { historyId, amount } = req.body || {};
    let numeric = Number(amount) || 0;

    // If historyId provided, try to read amount from history when amount not provided
    if (historyId && (!numeric || numeric === 0)) {
      const hist = await HistoryBanking.findById(historyId);
      if (hist) numeric = Number(hist.amount) || 0;
    }

    if (!numeric || numeric <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

    // Prevent duplicate pending approval for the same historyId or same user+amount
    if (historyId) {
      const exists = await ApprovePaying.findOne({ historyId: historyId, user: userId, approved: false });
      if (exists) return res.status(409).json({ success: false, message: 'Yêu cầu xác nhận đã được gửi trước đó' });
    } else {
      const exists = await ApprovePaying.findOne({ user: userId, amount: numeric, approved: false });
      if (exists) return res.status(409).json({ success: false, message: 'Yêu cầu xác nhận tương tự đã được gửi trước đó' });
    }

    const approve = await ApprovePaying.create({ user: userId, amount: numeric, historyId: historyId || null });
    return res.json({ success: true, approve });
  } catch (err) {
    console.error('createApproveRequest error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get user's payment history
exports.getMyHistory = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const items = await HistoryBanking.find({ user: userId }).sort({ createdAt: -1 });
    return res.json({ success: true, items });
  } catch (err) {
    console.error('getMyHistory error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Return wallet for current user
exports.getWallet = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) wallet = { balance: 0 };
    return res.json({ success: true, wallet });
  } catch (err) {
    console.error('getWallet error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Purchase a package: deduct from wallet and create history record
exports.purchasePackage = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { packageKey } = req.body || {};
    const packages = { '1m': 50000, '3m': 120000, '6m': 210000 };
    const price = packages[packageKey];
    if (!price) return res.status(400).json({ success: false, message: 'Invalid package' });

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) wallet = await Wallet.create({ user: userId, balance: 0 });

    if (Number(wallet.balance || 0) < Number(price)) {
      return res.status(402).json({ success: false, message: 'Insufficient balance', required: price });
    }

    // deduct
    wallet.balance = Number(wallet.balance || 0) - Number(price);
    wallet.updatedAt = new Date();
    await wallet.save();

    // create history record for outflow
    const hist = await HistoryBanking.create({ user: userId, amount: price, type: 'out', status: 'completed', note: `Buy package ${packageKey}` });

    // Extend or create IsLandor expiry for this user
    try {
      const monthsMap = { '1m': 1, '3m': 3, '6m': 6 };
      const months = monthsMap[packageKey] || 0;
      if (months > 0) {
        const now = new Date();
        let rec = await IsLandor.findOne({ user: userId });
        if (rec && rec.expiresAt && rec.expiresAt > now) {
          // extend existing expiry
          const newExpiry = new Date(rec.expiresAt);
          newExpiry.setMonth(newExpiry.getMonth() + months);
          rec.expiresAt = newExpiry;
          rec.updatedAt = new Date();
          await rec.save();
        } else {
          // create or reset expiry starting from now
          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + months);
          if (!rec) {
            rec = await IsLandor.create({ user: userId, expiresAt });
          } else {
            rec.expiresAt = expiresAt;
            rec.updatedAt = new Date();
            await rec.save();
          }
        }
  // include isLandor info in response (record saved)
      }
    } catch (e) {
      console.error('Failed to update IsLandor record:', e);
    }

    return res.json({ success: true, wallet, hist });
  } catch (err) {
    console.error('purchasePackage error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Admin: list pending approvals
exports.listPendingApprovals = async (req, res) => {
  try {
    const items = await ApprovePaying.find({ approved: false }).sort({ createdAt: -1 }).populate('user', 'username email');
    return res.json({ success: true, items });
  } catch (err) {
    console.error('listPendingApprovals error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Admin approves a payment: verify admin then mark approved and credit wallet and update history
exports.approvePayment = async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const approveId = req.params.id;
    const approve = await ApprovePaying.findById(approveId);
    if (!approve) return res.status(404).json({ success: false, message: 'Approve record not found' });
    if (approve.approved) return res.status(400).json({ success: false, message: 'Already approved' });

    // mark as approved
    approve.approved = true;
    approve.admin = adminId;
    approve.approvedAt = new Date();
    await approve.save();

    // credit user's wallet
    const WalletModel = Wallet;
    let wallet = await WalletModel.findOne({ user: approve.user });
    if (!wallet) wallet = await WalletModel.create({ user: approve.user, balance: 0 });
    wallet.balance = Number(wallet.balance || 0) + Number(approve.amount || 0);
    wallet.updatedAt = new Date();
    await wallet.save();

    // update history: if approve record links to a historyId, update that specific record
    let hist = null;
    if (approve.historyId) {
      hist = await HistoryBanking.findByIdAndUpdate(approve.historyId, { status: 'completed' }, { new: true });
    } else {
      hist = await HistoryBanking.findOneAndUpdate({ user: approve.user, amount: approve.amount, status: 'pending' }, { status: 'completed' }, { new: true });
    }

    return res.json({ success: true, approve, wallet, hist });
  } catch (err) {
    console.error('approvePayment error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Return whether current user has an active IsLandor (package)
exports.getIsLandorStatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const rec = await IsLandor.findOne({ user: userId });
    const now = new Date();
    const isActive = !!(rec && rec.expiresAt && rec.expiresAt > now);
    return res.json({ success: true, isActive, expiresAt: rec ? rec.expiresAt : null });
  } catch (err) {
    console.error('getIsLandorStatus error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
