const pool = require('../config/db');

class Task {

    //Создает новую задачу

    static async create(userId, taskData) {
        try {
            const {
                title,
                description = null,
                category_id = 'other',
                due_date = null
            } = taskData;

            // Получаем максимальный порядковый номер для активных задач пользователя
            const orderQuery = `
                SELECT COALESCE(MIN("order") - 1, 0) as new_order
                FROM tasks
                WHERE user_id = $1 AND status = 'active'
            `;
            const orderResult = await pool.query(orderQuery, [userId]);
            const newOrder = orderResult.rows[0].new_order;

            const query = `
                INSERT INTO tasks (
                    user_id, title, description, category_id,
                    due_date, status, "order"
                )
                VALUES ($1, $2, $3, $4, $5, 'active', $6)
                RETURNING *
            `;

            const result = await pool.query(query, [
                userId, title, description, category_id, due_date, newOrder
            ]);

            return result.rows[0];
        } catch (error) {
            console.error('Error in create task:', error);
            throw error;
        }
    }

    //Получает все задачи пользователя с фильтрацией

    static async getAllByUserId(userId, filters = {}) {
        try {
            const {
                status,
                category_id,
                date,
                sortType = 'order'
            } = filters;

            let whereConditions = ['t.user_id = $1'];
            const values = [userId];
            let paramCount = 2;

            // Добавляем условия фильтрации
            if (status) {
                whereConditions.push(`t.status = $${paramCount}`);
                values.push(status);
                paramCount++;
            }

            if (category_id) {
                whereConditions.push(`t.category_id = $${paramCount}`);
                values.push(category_id);
                paramCount++;
            }

            if (date) {
                whereConditions.push(`t.due_date::date = $${paramCount}::date`);
                values.push(date);
                paramCount++;
            }

            // Формируем ORDER BY в зависимости от статуса задачи
            let orderBy = `
                CASE t.status
                    WHEN 'completed' THEN 2
                    ELSE 1
                END,
                CASE t.status
                    WHEN 'completed' THEN t.completed_at
                    ELSE NULL
                END DESC NULLS LAST,
                CASE t.status
                    WHEN 'active' THEN
                        CASE '${sortType}'
                            WHEN 'asc' THEN t.due_date
                            WHEN 'desc' THEN t.due_date
                            ELSE NULL
                        END
                END ${sortType === 'desc' ? 'DESC' : 'ASC'} NULLS LAST,
                CASE t.status
                    WHEN 'active' THEN
                        CASE '${sortType}'
                            WHEN 'nearest' THEN EXTRACT(EPOCH FROM (t.due_date - CURRENT_TIMESTAMP))
                            WHEN 'farthest' THEN EXTRACT(EPOCH FROM (t.due_date - CURRENT_TIMESTAMP))
                            ELSE t."order"
                        END
                END ${sortType === 'farthest' ? 'DESC' : 'ASC'} NULLS LAST,
                CASE 
                    WHEN t.status = 'active' AND t.due_date IS NULL THEN 2
                    WHEN t.status = 'active' THEN 1
                    ELSE NULL
                END
            `;

            const query = `
                SELECT 
                    t.*,
                    c.name as category_name,
                    c.color as category_color
                FROM tasks t
                LEFT JOIN categories c ON t.category_id = c.category_id AND t.user_id = c.user_id
                WHERE ${whereConditions.join(' AND ')}
                ORDER BY ${orderBy}
            `;

            const result = await pool.query(query, values);

            // Разделяем задачи на активные и выполненные
            return {
                active: result.rows.filter(task => task.status === 'active'),
                completed: result.rows.filter(task => task.status === 'completed')
            };
        } catch (error) {
            console.error('Error in getAllByUserId:', error);
            throw error;
        }
    }

    //Обновляет задачу

    static async update(taskId, userId, updateData) {
        try {
            const allowedFields = [
                'title', 'description', 'category_id', 'due_date',
                'status', 'completed_at', 'order', 'notification_time',
                'notifications_enabled'
            ];
            
            const updates = [];
            const values = [taskId, userId];
            let paramCount = 3;

            Object.keys(updateData).forEach(key => {
                if (allowedFields.includes(key)) {
                    updates.push(`${key} = $${paramCount}`);
                    values.push(updateData[key]);
                    paramCount++;
                }
            });

            if (updates.length === 0) return null;

            const query = `
                UPDATE tasks
                SET ${updates.join(', ')}
                WHERE task_id = $1 AND user_id = $2
                RETURNING *
            `;

            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Error in update task:', error);
            throw error;
        }
    }

    //Изменяет статус задачи (активная/выполненная)

    static async changeStatus(taskId, userId, newStatus) {
        try {
            const query = `
                UPDATE tasks
                SET 
                    status = $3::text,
                    completed_at = CASE 
                        WHEN $3::text = 'completed' THEN CURRENT_TIMESTAMP
                        ELSE NULL
                    END
                WHERE task_id = $1 AND user_id = $2
                RETURNING *
            `;

            const result = await pool.query(query, [taskId, userId, newStatus]);
            return result.rows[0];
        } catch (error) {
            console.error('Error in changeStatus:', error);
            throw error;
        }
    }

    //Обновляет порядок задач

    static async updateOrder(userId, orderData) {
        try {
            await pool.query('BEGIN');

            for (const { taskId, order } of orderData) {
                await pool.query(
                    'UPDATE tasks SET "order" = $1 WHERE task_id = $2 AND user_id = $3',
                    [order, taskId, userId]
                );
            }

            await pool.query('COMMIT');
            return true;
        } catch (error) {
            await pool.query('ROLLBACK');
            console.error('Error in updateOrder:', error);
            throw error;
        }
    }

    //Удаляет задачу

    static async delete(taskId, userId) {
        try {
            const query = 'DELETE FROM tasks WHERE task_id = $1 AND user_id = $2';
            const result = await pool.query(query, [taskId, userId]);
            return result.rowCount > 0;
        } catch (error) {
            console.error('Error in delete task:', error);
            throw error;
        }
    }

    //Получает статистику по задачам пользователя

    static async getStatistics(userId) {
        try {
            const query = `
                SELECT
                    COUNT(*) FILTER (WHERE status = 'active') as active_count,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
                    COUNT(*) as total_count,
                    json_object_agg(
                        COALESCE(c.name, 'Без категории'),
                        COUNT(*)
                    ) FILTER (WHERE status = 'active') as active_by_category,
                    json_object_agg(
                        COALESCE(c.name, 'Без категории'),
                        COUNT(*)
                    ) FILTER (WHERE status = 'completed') as completed_by_category
                FROM tasks t
                LEFT JOIN categories c ON t.category_id = c.category_id
                WHERE t.user_id = $1
                GROUP BY t.user_id
            `;

            const result = await pool.query(query, [userId]);
            return result.rows[0] || {
                active_count: 0,
                completed_count: 0,
                total_count: 0,
                active_by_category: {},
                completed_by_category: {}
            };
        } catch (error) {
            console.error('Error in getStatistics:', error);
            throw error;
        }
    }

    //Получает данные для графика продуктивности

    static async getProductivityData(userId, { startDate, endDate }) {
        try {
            const query = `
                WITH RECURSIVE dates AS (
                    SELECT date_trunc('day', $2::timestamp) as date
                    UNION ALL
                    SELECT date + interval '1 day'
                    FROM dates
                    WHERE date < date_trunc('day', $3::timestamp)
                )
                SELECT 
                    dates.date::date as date,
                    COUNT(t.task_id) as completed_count
                FROM dates
                LEFT JOIN tasks t ON 
                    date_trunc('day', t.completed_at) = dates.date
                    AND t.user_id = $1
                    AND t.status = 'completed'
                GROUP BY dates.date
                ORDER BY dates.date;
            `;

            const result = await pool.query(query, [userId, startDate, endDate]);
            return result.rows;
        } catch (error) {
            console.error('Error in getProductivityData:', error);
            throw error;
        }
    }

    //Находит задачу по ID

    static async findById(taskId, userId) {
        try {
            const query = `
                SELECT t.*, c.name as category_name, c.color as category_color
                FROM tasks t
                LEFT JOIN categories c ON t.category_id = c.category_id AND t.user_id = c.user_id
                WHERE t.task_id = $1 AND t.user_id = $2
            `;
            const result = await pool.query(query, [taskId, userId]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('Error in findById:', error);
            throw error;
        }
    }

    //Обновляет настройки уведомлений задачи

    static async updateNotifications(taskId, userId, settings) {
        try {
            const query = `
                UPDATE tasks
                SET notifications_enabled = $1,
                    notification_time = $2
                WHERE task_id = $3 AND user_id = $4
                RETURNING *
            `;
            
            const result = await pool.query(query, [
                settings.notifications_enabled,
                settings.notification_time,
                taskId,
                userId
            ]);

            return result.rows[0];
        } catch (error) {
            console.error('Error in updateNotifications:', error);
            throw error;
        }
    }
}

module.exports = Task;
