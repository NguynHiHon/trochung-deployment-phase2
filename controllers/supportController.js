const Support = require('../models/Support');
const crypto = require('crypto');

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || (process.env.JWT_SECRET || 'default_secret');

function generateCaptchaCode(length = 4) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

function signCaptcha(code, expiresAtMs) {
    const data = `${code}:${expiresAtMs}`;
    const sig = crypto.createHmac('sha256', CAPTCHA_SECRET).update(data).digest('hex');
    return `${expiresAtMs}.${sig}`; // token
}

function verifyCaptcha(enteredCode, token) {
    if (!enteredCode || !token) return false;
    const [expiresAtStr, sig] = String(token).split('.');
    const expiresAtMs = Number(expiresAtStr);
    if (!expiresAtMs || !sig) return false;
    if (Date.now() > expiresAtMs) return false; // expired
    const expectedSig = crypto
        .createHmac('sha256', CAPTCHA_SECRET)
        .update(`${enteredCode}:${expiresAtMs}`)
        .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
}

const supportController = {
    create: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const { name, email, phone, message, captcha } = req.body;
            if (!name || !email || !message) {
                return res.status(400).json({ success: false, message: 'Missing required fields' });
            }

            // Captcha verification
            const isCaptchaOk = verifyCaptcha(captcha?.code, captcha?.token);
            if (!isCaptchaOk) {
                return res.status(400).json({ success: false, message: 'Invalid captcha' });
            }

            const doc = await Support.create({ userId, name, email, phone, message });
            return res.status(201).json({ success: true, data: doc });
        } catch (err) {
            console.error('Create support error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    },

    listMine: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const items = await Support.find({ userId }).sort({ createdAt: -1 });
            return res.json({ success: true, data: items });
        } catch (err) {
            console.error('List support error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    },

    captcha: async (_req, res) => {
        // Generate a short code and signed token, expire in 3 minutes
        const code = generateCaptchaCode(4);
        const expiresAtMs = Date.now() + 3 * 60 * 1000;
        const token = signCaptcha(code, expiresAtMs);
        // For simplicity we return the code as display text
        return res.json({ success: true, display: code, token, expiresAt: expiresAtMs });
    },

    // Admin functions
    getAll: async (req, res) => {
        try {
            const { page = 1, limit = 10, status } = req.query;
            const skip = (page - 1) * limit;

            let filter = {};
            if (status && status !== 'all') {
                filter.status = status;
            }

            const items = await Support.find(filter)
                .populate('userId', 'username email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit));

            const total = await Support.countDocuments(filter);

            return res.json({
                success: true,
                data: items,
                pagination: {
                    current: parseInt(page),
                    total: Math.ceil(total / limit),
                    count: items.length,
                    totalItems: total
                }
            });
        } catch (err) {
            console.error('Get all support error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    },

    updateStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!['open', 'in_progress', 'closed'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid status' });
            }

            const item = await Support.findByIdAndUpdate(
                id,
                { status },
                { new: true }
            ).populate('userId', 'username email');

            if (!item) {
                return res.status(404).json({ success: false, message: 'Support not found' });
            }

            return res.json({ success: true, data: item });
        } catch (err) {
            console.error('Update support status error:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    }
};

module.exports = supportController;


