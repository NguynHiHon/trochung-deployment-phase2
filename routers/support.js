const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { verifyToken, verifyAdmin } = require('../middleware/middlewareControllers');

// ✅ Route này ai cũng gọi được (hiển thị captcha)
router.get('/captcha', supportController.captcha);

// ✅ Còn các route bên dưới phải đăng nhập mới được
router.post('/', verifyToken, supportController.create);
router.get('/mine', verifyToken, supportController.listMine);

// ✅ Admin routes - chỉ admin mới được truy cập
router.get('/admin/all', verifyToken, verifyAdmin, supportController.getAll);
router.put('/admin/:id/status', verifyToken, verifyAdmin, supportController.updateStatus);

module.exports = router;
