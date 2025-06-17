const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const routes = require('./routes');
const pool = require('./config/db');
const notificationService = require('./services/NotificationService');

const app = express();

// Настройка CORS для поддержки всех доменов
app.use(cors({
    origin: true, // Разрешаем все домены
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(morgan('dev')); // Логирование запросов
app.use(express.json()); // Парсинг JSON
app.use(express.urlencoded({ extended: true })); // Парсинг URL-encoded bodies

// Статические файлы
app.use(express.static(path.join(__dirname, '..'))); // Корневая директория проекта
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use('/js', express.static(path.join(__dirname, '../javascript')));
app.use('/img', express.static(path.join(__dirname, '../img')));
app.use('/dist', express.static(path.join(__dirname, '../dist')));

// Проверка подключения к базе данных
pool.query('SELECT NOW()', (err, res) => {
    if(err) {
        console.error('Error connecting to the database', err.stack);
    } else {
        console.log('Connected to the database:', res.rows[0]);
    }
});

// Функция для проверки данных от Telegram
function verifyTelegramData(data) {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
        throw new Error('BOT_TOKEN не настроен');
    }

    const dataToCheck = Object.keys(data)
        .filter(key => key !== 'hash')
        .sort()
        .map(key => `${key}=${data[key]}`)
        .join('\n');

    const secretKey = crypto.createHash('sha256')
        .update(botToken)
        .digest();

    const hash = crypto.createHmac('sha256', secretKey)
        .update(dataToCheck)
        .digest('hex');

    return hash === data.hash;
}

// Middleware для проверки авторизации
function authMiddleware(req, res, next) {
    // Пропускаем маршруты авторизации и статические файлы
    if (req.path === '/api/auth/telegram' || 
        req.path === '/api/auth/verify' || 
        req.path === '/login.html' ||
        req.path.startsWith('/css/') ||
        req.path.startsWith('/js/') ||
        req.path.startsWith('/javascript/') ||
        req.path.startsWith('/img/') ||
        req.path.startsWith('/dist/')) {
        return next();
    }

    // Проверяем авторизацию для API запросов
    if (req.path.startsWith('/api/')) {
        const authHeader = req.header('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Требуется аутентификация' });
        }

        try {
            const token = authHeader.replace('Bearer ', '');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
            return next();
        } catch (error) {
            return res.status(401).json({ error: 'Недействительный токен' });
        }
    }

    // Для остальных запросов проверяем наличие токена и перенаправляем на страницу входа
    if (!req.headers.cookie || !req.headers.cookie.includes('auth_token')) {
        return res.redirect('/login.html');
    }

    next();
}

// Применяем middleware для авторизации
app.use(authMiddleware);

// Маршрут для авторизации через Telegram
app.post('/api/auth/telegram', async (req, res) => {
    try {
        const telegramData = req.body;

        // Проверяем данные от Telegram
        if (!verifyTelegramData(telegramData)) {
            return res.status(401).json({ error: 'Недействительные данные авторизации' });
        }

        // Проверяем/создаем пользователя в базе данных
        const result = await pool.query(
            'INSERT INTO telegram_users (telegram_chat_id, username, first_name, last_name) VALUES ($1, $2, $3, $4) ON CONFLICT (telegram_chat_id) DO UPDATE SET username = $2, first_name = $3, last_name = $4 RETURNING *',
            [telegramData.id, telegramData.username, telegramData.first_name, telegramData.last_name]
        );

        const user = result.rows[0];

        // Создаем JWT токен
        const token = jwt.sign(
            { 
                user_id: user.user_id,
                telegram_chat_id: user.telegram_chat_id,
                username: user.username
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, user });
    } catch (error) {
        console.error('Ошибка авторизации:', error);
        res.status(500).json({ error: 'Ошибка при авторизации' });
    }
});

// Маршрут для проверки токена
app.get('/api/auth/verify', (req, res) => {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    try {
        const token = authHeader.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({ valid: true, user: decoded });
    } catch (error) {
        res.status(401).json({ valid: false, error: 'Недействительный токен' });
    }
});

// Базовые маршруты для фронтенда
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../login.html'));
});

// Маршруты API
app.use('/api', routes);

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Что-то пошло не так! Попробуйте позже.' 
    });
});

// Обработка несуществующих маршрутов
app.use((req, res) => {
    // Если запрос к API
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Маршрут не найден' });
    }
    // Для всех остальных запросов отправляем страницу входа
    res.sendFile(path.join(__dirname, '../login.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Запускаем сервис уведомлений
    notificationService.startNotificationService();
});