const express = require('express');
const router = express.Router();
const userInfoController = require('../controllers/userInfoController');
const { verifyToken } = require('../middleware/middlewareControllers'); // Middleware authentication

// Routes cho thông tin người dùng

// @route   POST /api/user-info
// @desc    Tạo hoặc cập nhật thông tin người dùng
// @access  Private
router.post('/', verifyToken, userInfoController.createOrUpdateUserInfo);

// @route   GET /api/user-info/me  
// @desc    Lấy thông tin người dùng hiện tại
// @access  Private
router.get('/me', verifyToken, userInfoController.getMyInfo);

// @route   GET /api/user-info/:id
// @desc    Lấy thông tin người dùng theo id (công khai)
// @access  Public
// NOTE: Route removed — use GET /api/user-info/me (authenticated) instead per frontend flow



module.exports = router;