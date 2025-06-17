const pool = require('../config/db');

class Category {

    //Создает новую категорию

    static async create(userId, { name, color }) {
        try {
            const query = `
                INSERT INTO categories (category_id, user_id, name, color)
                VALUES (
                    'cat_' || extract(epoch from now())::text || '_' || floor(random() * 10000)::text,
                    $1, $2, $3
                )
                RETURNING *
            `;
            const result = await pool.query(query, [userId, name, color]);
            return result.rows[0];
        } catch (error) {
            console.error('Error in create category:', error);
            throw error;
        }
    }

    //Получает все категории пользователя

    static async getAllByUserId(userId) {
        try {
            const query = 'SELECT * FROM categories WHERE user_id = $1 ORDER BY created_at';
            const result = await pool.query(query, [userId]);
            return result.rows;
        } catch (error) {
            console.error('Error in getAllByUserId:', error);
            throw error;
        }
    }

    //Получает категорию по ID

    static async getById(categoryId, userId) {
        try {
            const query = 'SELECT * FROM categories WHERE category_id = $1 AND user_id = $2';
            const result = await pool.query(query, [categoryId, userId]);
            return result.rows[0];
        } catch (error) {
            console.error('Error in getById:', error);
            throw error;
        }
    }

    //Обновляет категорию

    static async update(categoryId, userId, updateData) {
        try {
            const allowedFields = ['name', 'color'];
            const updates = [];
            const values = [categoryId, userId];
            let paramCount = 3;

            // Формируем динамический SET для SQL запроса
            Object.keys(updateData).forEach(key => {
                if (allowedFields.includes(key)) {
                    updates.push(`${key} = $${paramCount}`);
                    values.push(updateData[key]);
                    paramCount++;
                }
            });

            if (updates.length === 0) return null;

            const query = `
                UPDATE categories
                SET ${updates.join(', ')}
                WHERE category_id = $1 AND user_id = $2
                RETURNING *
            `;
            
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Error in update category:', error);
            throw error;
        }
    }

    //Удаляет категорию и переносит все задачи в категорию по умолчанию

    static async delete(categoryId, userId, defaultCategoryId) {
        try {
            // Начинаем транзакцию
            await pool.query('BEGIN');

            // Перемещаем все задачи в категорию по умолчанию
            await pool.query(
                'UPDATE tasks SET category_id = $1 WHERE category_id = $2 AND user_id = $3',
                [defaultCategoryId, categoryId, userId]
            );

            // Удаляем категорию
            const deleteQuery = 'DELETE FROM categories WHERE category_id = $1 AND user_id = $2';
            const result = await pool.query(deleteQuery, [categoryId, userId]);

            // Завершаем транзакцию
            await pool.query('COMMIT');

            return result.rowCount > 0;
        } catch (error) {
            // Откатываем транзакцию в случае ошибки
            await pool.query('ROLLBACK');
            console.error('Error in delete category:', error);
            throw error;
        }
    }

    //Создает стандартные категории для нового пользователя

    static async createDefaultCategory(userId) {
        try {
            // Определяем стандартные категории
            const defaultCategories = [
                {
                    id: 'other',
                    name: 'Общее',
                    color: '#607D8B',
                    is_default: true
                },
                {
                    id: 'work',
                    name: 'Работа',
                    color: '#FF5252',
                    is_default: true
                },
                {
                    id: 'personal',
                    name: 'Личное',
                    color: '#69F0AE',
                    is_default: true
                },
                {
                    id: 'shopping',
                    name: 'Покупки',
                    color: '#448AFF',
                    is_default: true
                }
            ];

            const createdCategories = [];

            // Начинаем транзакцию
            await pool.query('BEGIN');

            try {
                for (const category of defaultCategories) {
                    // Проверяем, существует ли уже категория
                    const checkQuery = `
                        SELECT * FROM categories 
                        WHERE category_id = $1 AND user_id = $2
                    `;
                    const existingCategory = await pool.query(checkQuery, [category.id, userId]);

                    if (existingCategory.rows.length === 0) {
                        // Если категории нет, создаем новую
                        const query = `
                            INSERT INTO categories (
                                category_id, user_id, name, color, is_default
                            )
                            VALUES ($1, $2, $3, $4, $5)
                            RETURNING *
                        `;
                        const result = await pool.query(query, [
                            category.id,
                            userId,
                            category.name,
                            category.color,
                            category.is_default
                        ]);
                        createdCategories.push(result.rows[0]);
                    } else {
                        createdCategories.push(existingCategory.rows[0]);
                    }
                }

                // Если все успешно, фиксируем транзакцию
                await pool.query('COMMIT');
                return createdCategories;

            } catch (error) {
                // В случае ошибки откатываем транзакцию
                await pool.query('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error('Error in createDefaultCategory:', error);
            throw error;
        }
    }

    //Проверяет, существует ли категория и принадлежит ли она пользователю

    static async exists(categoryId, userId) {
        try {
            const query = 'SELECT EXISTS(SELECT 1 FROM categories WHERE category_id = $1 AND user_id = $2)';
            const result = await pool.query(query, [categoryId, userId]);
            return result.rows[0].exists;
        } catch (error) {
            console.error('Error in category exists check:', error);
            throw error;
        }
    }
}

module.exports = Category;
