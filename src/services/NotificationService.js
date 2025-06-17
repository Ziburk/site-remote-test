const pool = require('../config/db');
const bot = require('../bot/bot');

const notificationService = {

    //Проверяет и отправляет уведомления
    async checkAndSendNotifications() {
        try {
            // Получаем все активные задачи с включенными уведомлениями,
            // у которых время уведомления находится в текущей минуте
            const query = `
                SELECT 
                    t.*,
                    tu.telegram_chat_id,
                    c.name as category_name
                FROM tasks t
                JOIN telegram_users tu ON t.user_id = tu.user_id
                LEFT JOIN categories c ON t.category_id = c.category_id AND t.user_id = c.user_id
                WHERE t.notifications_enabled = true
                    AND t.status = 'active'
                    AND t.notification_time >= NOW()
                    AND t.notification_time < NOW() + INTERVAL '1 minute'
                    AND NOT EXISTS (
                        SELECT 1 
                        FROM notification_history nh 
                        WHERE nh.task_id = t.task_id
                            AND nh.sent_at > NOW()
                    )
            `;

            const result = await pool.query(query);
            const tasksToNotify = result.rows;

            // Отправляем уведомления для каждой задачи
            for (const task of tasksToNotify) {
                try {
                    const message = this.formatNotificationMessage(task);
                    await bot.telegram.sendMessage(task.telegram_chat_id, message, { parse_mode: 'HTML' });

                    // Записываем в историю уведомлений
                    await pool.query(
                        `INSERT INTO notification_history (task_id, user_id, status)
                         VALUES ($1, $2, $3)
                         RETURNING *`,
                        [task.task_id, task.user_id, 'sent']
                    );
                } catch (error) {
                    console.error(`Ошибка при отправке уведомления для задачи ${task.task_id}:`, error);
                    
                    // Записываем неудачную попытку в историю
                    await pool.query(
                        `INSERT INTO notification_history (task_id, user_id, status)
                         VALUES ($1, $2, $3)
                         RETURNING *`,
                        [task.task_id, task.user_id, 'failed']
                    );
                }
            }
        } catch (error) {
            console.error('Ошибка при проверке уведомлений:', error);
        }
    },

    //Форматирует сообщение уведомления
    formatNotificationMessage(task) {
        const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('ru-RU') : 'не указан';
        const category = task.category_name || 'Без категории';

        return `🔔 <b>Напоминание о задаче!</b>\n\n` +
               `📌 <b>Задача:</b> ${task.title}\n` +
               `📅 <b>Срок:</b> ${dueDate}\n` +
               `🏷 <b>Категория:</b> ${category}\n` +
               (task.description ? `\n📝 <b>Описание:</b>\n${task.description}` : '');
    },

    //Очищает историю уведомлений для задачи
    async clearNotificationHistory(taskId, userId) {
        try {
            await pool.query(
                'DELETE FROM notification_history WHERE task_id = $1 AND user_id = $2',
                [taskId, userId]
            );
        } catch (error) {
            console.error('Ошибка при очистке истории уведомлений:', error);
        }
    },

    //Запускает сервис уведомлений
    startNotificationService() {
        // Проверяем уведомления каждую минуту
        setInterval(async () => {
            await this.checkAndSendNotifications();
        }, 60000); // 60000 мс = 1 минута

        console.log('Сервис уведомлений запущен');
    }
};

module.exports = notificationService; 