const { Pool } = require('pg');
const config = require('../config/config');

const pool = new Pool({
    connectionString: config.databaseUrl
});

// Функции для работы с пользователями
async function getOrCreateUser(telegramId, username, firstName, lastName) {
    const query = `
        INSERT INTO telegram_users (telegram_chat_id, username, first_name, last_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (telegram_chat_id) 
        DO UPDATE SET username = $2, first_name = $3, last_name = $4
        RETURNING *
    `;
    
    const result = await pool.query(query, [telegramId, username, firstName, lastName]);
    return result.rows[0];
}

// Функции для работы с категориями
async function getUserCategories(userId) {
    const query = 'SELECT * FROM categories WHERE user_id = $1 ORDER BY created_at';
    const result = await pool.query(query, [userId]);
    return result.rows;
}

async function createCategory(userId, name, color) {
    const query = `
        INSERT INTO categories (category_id, user_id, name, color)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `;
    const categoryId = 'cat_' + Date.now().toString(36);
    const result = await pool.query(query, [categoryId, userId, name, color]);
    return result.rows[0];
}

// Функции для работы с задачами
async function getUserTasks(userId) {
    const query = `
        SELECT t.*, c.name as category_name, c.color as category_color 
        FROM tasks t
        LEFT JOIN categories c ON t.category_id = c.category_id AND t.user_id = c.user_id
        WHERE t.user_id = $1
        ORDER BY t."order"
    `;
    const result = await pool.query(query, [userId]);
    return {
        active: result.rows.filter(task => task.status === 'active'),
        completed: result.rows.filter(task => task.status === 'completed')
    };
}

async function createTask(userId, title, categoryId, dueDate, order = 0) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Сначала сдвигаем order всех существующих задач
        const updateOrderQuery = `
            UPDATE tasks 
            SET "order" = "order" + 1 
            WHERE user_id = $1
        `;
        await client.query(updateOrderQuery, [userId]);

        // Затем создаем новую задачу с order = 0
        const createTaskQuery = `
            INSERT INTO tasks (user_id, title, category_id, due_date, status, "order")
            VALUES ($1, $2, $3, $4, 'active', 0)
            RETURNING *
        `;
        const result = await client.query(createTaskQuery, [userId, title, categoryId, dueDate]);

        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function completeTask(taskId, userId) {
    const query = `
        UPDATE tasks 
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE task_id = $1 AND user_id = $2
        RETURNING *
    `;
    const result = await pool.query(query, [taskId, userId]);
    return result.rows[0];
}

async function uncompleteTask(taskId, userId) {
    const query = `
        UPDATE tasks 
        SET status = 'active', completed_at = NULL
        WHERE task_id = $1 AND user_id = $2
        RETURNING *
    `;
    const result = await pool.query(query, [taskId, userId]);
    return result.rows[0];
}

async function updateTaskDate(taskId, userId, dueDate) {
    const query = `
        UPDATE tasks 
        SET due_date = $3::timestamp with time zone
        WHERE task_id = $1 AND user_id = $2
        RETURNING *
    `;
    const result = await pool.query(query, [taskId, userId, dueDate]);
    return result.rows[0];
}

async function updateTaskCategory(taskId, categoryId, userId) {
    const query = `
        UPDATE tasks 
        SET category_id = $2
        WHERE task_id = $1 AND user_id = $3
        RETURNING *
    `;
    const result = await pool.query(query, [taskId, categoryId, userId]);
    return result.rows[0];
}

async function deleteTask(taskId, userId) {
    const query = 'DELETE FROM tasks WHERE task_id = $1 AND user_id = $2';
    await pool.query(query, [taskId, userId]);
}

// Функция для создания стандартных категорий для нового пользователя
async function createDefaultCategories(userId) {
    const defaultCategories = [
        { name: 'Общее', color: '#607D8B' },
        { name: 'Работа', color: '#FF5252' },
        { name: 'Личное', color: '#69F0AE' },
        { name: 'Покупки', color: '#448AFF' }
    ];

    // Получаем существующие категории
    const existingCategories = await getUserCategories(userId);
    const existingNames = existingCategories.map(cat => cat.name);

    // Создаем только те категории, которых еще нет
    for (const category of defaultCategories) {
        if (!existingNames.includes(category.name)) {
            await createCategory(userId, category.name, category.color);
        }
    }
}

async function getTaskById(taskId) {
    const query = `
        SELECT t.*, c.name as category_name, c.color as category_color 
        FROM tasks t
        LEFT JOIN categories c ON t.category_id = c.category_id
        WHERE t.task_id = $1
    `;
    const result = await pool.query(query, [taskId]);
    return result.rows[0];
}

async function updateTaskTitle(taskId, title) {
    const query = `
        UPDATE tasks 
        SET title = $2
        WHERE task_id = $1
        RETURNING *
    `;
    const result = await pool.query(query, [taskId, title]);
    return result.rows[0];
}

async function updateTaskOrder(taskId, order) {
    const query = `
        UPDATE tasks 
        SET "order" = $2
        WHERE task_id = $1
        RETURNING *
    `;
    const result = await pool.query(query, [taskId, order]);
    return result.rows[0];
}

async function updateTaskNotifications(taskId, { notifications_enabled, notification_time }) {
    const query = `
        UPDATE tasks 
        SET notifications_enabled = $1, notification_time = $2
        WHERE task_id = $3
        RETURNING *
    `;
    const result = await pool.query(query, [notifications_enabled, notification_time, taskId]);
    return result.rows[0];
}

// Функция обновления описания задачи
async function updateTaskDescription(taskId, description) {
    const query = `
        UPDATE tasks 
        SET description = $2
        WHERE task_id = $1
        RETURNING *
    `;
    const result = await pool.query(query, [taskId, description]);
    return result.rows[0];
}

module.exports = {
    getOrCreateUser,
    getUserCategories,
    createCategory,
    getUserTasks,
    createTask,
    completeTask,
    uncompleteTask,
    updateTaskDate,
    updateTaskCategory,
    deleteTask,
    createDefaultCategories,
    getTaskById,
    updateTaskTitle,
    updateTaskOrder,
    updateTaskNotifications,
    updateTaskDescription
}; 