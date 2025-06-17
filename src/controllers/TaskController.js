const Task = require('../models/Task');
const pool = require('../config/db');
const notificationService = require('../services/notificationService');

class TaskController {
    //Получает список всех задач пользователя с фильтрацией

    static async getAllTasks(req, res) {
        try {
            const userId = req.user.user_id; // Получаем ID пользователя из объекта req.user
            const { status, category_id, date, sortType } = req.query;

            const tasks = await Task.getAllByUserId(userId, {
                status,
                category_id,
                date,
                sortType
            });

            res.json(tasks);
        } catch (error) {
            console.error('Error in getAllTasks:', error);
            res.status(500).json({ error: 'Ошибка при получении списка задач' });
        }
    }

    //Получает задачу по ID

    static async getTaskById(req, res) {
        try {
            const userId = req.user.user_id;
            const taskId = parseInt(req.params.taskId);

            const task = await Task.findById(taskId, userId);

            if (!task) {
                return res.status(404).json({ error: 'Задача не найдена' });
            }

            res.json(task);
        } catch (error) {
            console.error('Error in getTaskById:', error);
            res.status(500).json({ error: 'Ошибка при получении задачи' });
        }
    }

    //Создает новую задачу

    static async createTask(req, res) {
        try {
            const userId = req.user.user_id;
            const { title, description, category_id, due_date } = req.body;

            if (!title) {
                return res.status(400).json({ error: 'Название задачи обязательно' });
            }

            const task = await Task.create(userId, {
                title,
                description,
                category_id,
                due_date
            });

            res.status(201).json(task);
        } catch (error) {
            console.error('Error in createTask:', error);
            res.status(500).json({ error: 'Ошибка при создании задачи' });
        }
    }

    //Обновляет существующую задачу

    static async updateTask(req, res) {
        const taskId = parseInt(req.params.taskId);
        const { title, description, category_id, due_date, notification_time, notifications_enabled, status } = req.body;
        const userId = req.user.user_id;

        try {
            // Получаем текущие данные задачи
            const currentTask = await pool.query(
                'SELECT due_date, notification_time FROM tasks WHERE task_id = $1 AND user_id = $2',
                [taskId, userId]
            );

            if (currentTask.rows.length === 0) {
                return res.status(404).json({ error: 'Задача не найдена' });
            }

            // Проверяем, изменились ли дата или время уведомления
            const dateChanged = due_date !== currentTask.rows[0].due_date;
            const notificationTimeChanged = notification_time !== currentTask.rows[0].notification_time;

            // Обновляем задачу
            const result = await pool.query(
                `UPDATE tasks 
                 SET title = COALESCE($1, title),
                     description = COALESCE($2, description),
                     category_id = COALESCE($3, category_id),
                     due_date = COALESCE($4, due_date),
                     notification_time = COALESCE($5, notification_time),
                     notifications_enabled = COALESCE($6, notifications_enabled),
                     status = COALESCE($7, status)
                 WHERE task_id = $8 AND user_id = $9
                 RETURNING *`,
                [title, description, category_id, due_date, notification_time, notifications_enabled, status, taskId, userId]
            );

            // Если изменилась дата или время уведомления, очищаем историю уведомлений
            if (dateChanged || notificationTimeChanged) {
                await notificationService.clearNotificationHistory(taskId, userId);
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Ошибка при обновлении задачи:', error);
            res.status(500).json({ error: 'Ошибка при обновлении задачи' });
        }
    }

    //Изменяет статус задачи

    static async changeTaskStatus(req, res) {
        try {
            const userId = req.user.user_id;
            const taskId = parseInt(req.params.taskId);
            const { status } = req.body;

            if (!status || !['active', 'completed'].includes(status)) {
                return res.status(400).json({ error: 'Некорректный статус' });
            }

            const task = await Task.changeStatus(taskId, userId, status);

            if (!task) {
                return res.status(404).json({ error: 'Задача не найдена' });
            }

            res.json(task);
        } catch (error) {
            console.error('Error in changeTaskStatus:', error);
            res.status(500).json({ error: 'Ошибка при изменении статуса задачи' });
        }
    }

    //Обновляет порядок задач

    static async updateTaskOrder(req, res) {
        try {
            const userId = req.user.user_id;
            const { orderData } = req.body;

            if (!Array.isArray(orderData)) {
                return res.status(400).json({ error: 'Некорректные данные для обновления порядка' });
            }

            await Task.updateOrder(userId, orderData);
            res.json({ success: true });
        } catch (error) {
            console.error('Error in updateTaskOrder:', error);
            res.status(500).json({ error: 'Ошибка при обновлении порядка задач' });
        }
    }

    //Удаляет задачу

    static async deleteTask(req, res) {
        try {
            const userId = req.user.user_id;
            const taskId = parseInt(req.params.taskId);

            const success = await Task.delete(taskId, userId);

            if (!success) {
                return res.status(404).json({ error: 'Задача не найдена' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error in deleteTask:', error);
            res.status(500).json({ error: 'Ошибка при удалении задачи' });
        }
    }

    //Получает статистику по задачам

    static async getTaskStatistics(req, res) {
        try {
            const userId = req.user.user_id;
            const statistics = await Task.getStatistics(userId);
            res.json(statistics);
        } catch (error) {
            console.error('Error in getTaskStatistics:', error);
            res.status(500).json({ error: 'Ошибка при получении статистики' });
        }
    }

    //Получает данные для графика продуктивности

    static async getProductivityData(req, res) {
        try {
            const userId = req.user.user_id; // Используем правильное поле из объекта пользователя
            const { startDate, endDate } = req.query;
            
            if (!startDate || !endDate) {
                return res.status(400).json({
                    error: 'Необходимо указать начальную и конечную даты'
                });
            }

            const data = await Task.getProductivityData(userId, {
                startDate,
                endDate
            });

            res.json(data);
        } catch (error) {
            console.error('Error in getProductivityData:', error);
            res.status(500).json({ error: 'Ошибка при получении данных продуктивности' });
        }
    }

    //Обновляет настройки уведомлений задачи

    static async updateTaskNotifications(req, res) {
        try {
            const userId = req.user.user_id;
            const taskId = parseInt(req.params.taskId);
            const { notifications_enabled, notification_time } = req.body;

            // Проверяем существование задачи и права доступа
            const task = await Task.findById(taskId, userId);
            if (!task) {
                return res.status(404).json({ error: 'Задача не найдена' });
            }

            // Обновляем настройки уведомлений
            const updatedTask = await Task.updateNotifications(taskId, userId, {
                notifications_enabled,
                notification_time
            });

            res.json(updatedTask);
        } catch (error) {
            console.error('Error in updateTaskNotifications:', error);
            res.status(500).json({ error: 'Ошибка при обновлении настроек уведомлений' });
        }
    }
}

module.exports = TaskController;
