const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');

//Middleware для проверки JWT токена

const auth = async (req, res, next) => {
    try {
        // Получаем токен из заголовка
        const authHeader = req.header('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Требуется аутентификация' });
        }

        const token = authHeader.replace('Bearer ', '');

        // Проверяем токен
        const decoded = jwt.verify(token, config.jwtSecret);
        
        // Проверяем существование пользователя
        const user = await User.getById(decoded.user_id);
        
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        // Добавляем информацию о пользователе в объект запроса
        req.token = token;
        req.user = user;
        
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ error: 'Пожалуйста, авторизуйтесь' });
    }
};

module.exports = auth; 