const express = require('express');
const router = express.Router();
const TelegramController = require('../controllers/TelegramController');
const auth = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

// Тестовый эндпоинт для авторизации (только для разработки)
router.post('/test-token', (req, res) => {
    const testUser = {
        user_id: 1,
        telegram_id: '12345',
        username: 'test_user'
    };

    const token = jwt.sign(testUser, config.jwtSecret, { expiresIn: '24h' });
    res.json({ token, user: testUser });
});

// Маршруты аутентификации через Telegram
router.post('/telegram/login', TelegramController.handleTelegramAuth);

// Проверка и обновление токена (требует аутентификации)
router.post('/token/refresh', auth, TelegramController.validateAndRefreshToken);

// Выход из системы (требует аутентификации)
router.post('/logout', auth, TelegramController.handleLogout);

module.exports = router; 