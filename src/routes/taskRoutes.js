const express = require('express');
const router = express.Router();
const TaskController = require('../controllers/TaskController');
const auth = require('../middleware/auth');

// Все маршруты требуют аутентификации
router.use(auth);

// Получить статистику по задачам
router.get('/stats/summary', TaskController.getTaskStatistics);

// Получить статистику продуктивности
router.get('/stats/productivity', TaskController.getProductivityData);

// Получить все задачи пользователя
router.get('/', TaskController.getAllTasks);

// Создать новую задачу
router.post('/', TaskController.createTask);

// Обновить порядок задач
router.patch('/order', TaskController.updateTaskOrder);

// Обновить задачу
router.put('/:taskId', TaskController.updateTask);

// Удалить задачу
router.delete('/:taskId', TaskController.deleteTask);

// Изменить статус задачи
router.patch('/:taskId/status', TaskController.changeTaskStatus);

// Обновить настройки уведомлений задачи
router.patch('/:taskId/notifications', TaskController.updateTaskNotifications);

// Получить задачу по ID (должен быть последним GET маршрутом)
router.get('/:taskId', TaskController.getTaskById);

module.exports = router;
