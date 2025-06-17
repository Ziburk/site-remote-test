const express = require('express');
const router = express.Router();
const UserController = require('../controllers/UserController');
const auth = require('../middleware/auth');

// Все маршруты требуют аутентификации
router.use(auth);

// Получить информацию о текущем пользователе
router.get('/me', UserController.getCurrentUser);

// Обновить статус активности пользователя
router.patch('/status', UserController.updateActiveStatus);

// Удалить аккаунт
router.delete('/me', UserController.deleteAccount);

module.exports = router;
