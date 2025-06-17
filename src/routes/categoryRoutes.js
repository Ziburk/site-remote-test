const express = require('express');
const router = express.Router();
const CategoryController = require('../controllers/CategoryController');
const auth = require('../middleware/auth');

// Все маршруты требуют аутентификации
router.use(auth);

// Получить все категории пользователя
router.get('/', CategoryController.getAllCategories);

// Создать новую категорию
router.post('/', CategoryController.createCategory);

// Создать стандартные категории
router.post('/default', CategoryController.createDefaultCategories);

// Обновить категорию
router.put('/:categoryId', CategoryController.updateCategory);

// Удалить категорию
router.delete('/:categoryId', CategoryController.deleteCategory);

module.exports = router;
