const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken, verifyAdmin } = require('../middleware/middlewareControllers');

// User creates a payment request (can be anonymous amount)
router.post('/request', verifyToken, paymentController.createPaymentRequest);

// User gets own history
router.get('/history/mine', verifyToken, paymentController.getMyHistory);

// Admin: list pending approvals
router.get('/approvals/pending', verifyAdmin, paymentController.listPendingApprovals);

// User: request admin approval for a transfer (create ApprovePaying)
router.post('/approvals', verifyToken, paymentController.createApproveRequest);

// Get current user's wallet
router.get('/wallet', verifyToken, paymentController.getWallet);

// Get whether the user currently has an active paid package (IsLandor)
router.get('/islandor', verifyToken, paymentController.getIsLandorStatus);

// Purchase a package using wallet balance
router.post('/purchase', verifyToken, paymentController.purchasePackage);

// Admin: approve a pending approve record
router.put('/approvals/:id/approve', verifyAdmin, paymentController.approvePayment);

module.exports = router;
