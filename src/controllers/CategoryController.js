const Category = require('../models/Category');

class CategoryController {

    //Получает все категории пользователя

    static async getAllCategories(req, res) {
        try {
            const userId = req.user.user_id;
            const categories = await Category.getAllByUserId(userId);
            res.json(categories);
        } catch (error) {
            console.error('Error in getAllCategories:', error);
            res.status(500).json({ error: 'Ошибка при получении списка категорий' });
        }
    }

    //Создает новую категорию

    static async createCategory(req, res) {
        try {
            const userId = req.user.user_id;
            const { name, color } = req.body;

            if (!name || !color) {
                return res.status(400).json({ 
                    error: 'Название и цвет категории обязательны' 
                });
            }

            const category = await Category.create(userId, { name, color });
            res.status(201).json(category);
        } catch (error) {
            console.error('Error in createCategory:', error);
            if (error.code === '23505') { // Уникальное ограничение нарушено
                res.status(400).json({ 
                    error: 'Категория с таким названием уже существует' 
                });
            } else {
                res.status(500).json({ 
                    error: 'Ошибка при создании категории' 
                });
            }
        }
    }

    //Обновляет существующую категорию

    static async updateCategory(req, res) {
        try {
            const userId = req.user.user_id;
            const categoryId = req.params.categoryId;
            const { name, color } = req.body;

            // Проверяем, не пытается ли пользователь изменить категорию по умолчанию
            if (categoryId === 'other') {
                return res.status(403).json({ 
                    error: 'Категория по умолчанию не может быть изменена' 
                });
            }

            // Получаем текущую категорию
            const currentCategory = await Category.getById(categoryId, userId);
            if (!currentCategory) {
                return res.status(404).json({ error: 'Категория не найдена' });
            }

            // Обновляем только переданные поля, сохраняя текущие значения для остальных
            const updateData = {
                name: name || currentCategory.name,
                color: color || currentCategory.color
            };

            const category = await Category.update(categoryId, userId, updateData);

            if (!category) {
                return res.status(404).json({ error: 'Категория не найдена' });
            }

            res.json(category);
        } catch (error) {
            console.error('Error in updateCategory:', error);
            if (error.code === '23505') {
                res.status(400).json({ 
                    error: 'Категория с таким названием уже существует' 
                });
            } else {
                res.status(500).json({ 
                    error: 'Ошибка при обновлении категории' 
                });
            }
        }
    }

    //Удаляет категорию

    static async deleteCategory(req, res) {
        try {
            const userId = req.user.user_id;
            const categoryId = req.params.categoryId;

            // Проверяем, не пытается ли пользователь удалить категорию по умолчанию
            if (categoryId === 'other') {
                return res.status(403).json({ 
                    error: 'Категория по умолчанию не может быть удалена' 
                });
            }

            const success = await Category.delete(categoryId, userId);

            if (!success) {
                return res.status(404).json({ error: 'Категория не найдена' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error in deleteCategory:', error);
            res.status(500).json({ error: 'Ошибка при удалении категории' });
        }
    }

    //Создает стандартные категории для нового пользователя

    static async createDefaultCategories(req, res) {
        try {
            const userId = req.user.user_id;
            const categories = await Category.createDefaultCategory(userId);
            res.status(201).json(categories);
        } catch (error) {
            console.error('Error in createDefaultCategories:', error);
            res.status(500).json({ 
                error: 'Ошибка при создании стандартных категорий' 
            });
        }
    }
}

module.exports = CategoryController;
