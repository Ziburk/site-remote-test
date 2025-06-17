const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const categoryRoutes = require('./categoryRoutes');
const taskRoutes = require('./taskRoutes');

// Маршруты аутентификации
router.use('/auth', authRoutes);

// Маршруты для пользователей
router.use('/users', userRoutes);

// Маршруты для категорий
router.use('/categories', categoryRoutes);

// Маршруты для задач
router.use('/tasks', taskRoutes);

module.exports = router; 