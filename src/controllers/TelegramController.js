const User = require('../models/User');
const Category = require('../models/Category');

class TelegramController {

    //Обрабатывает вход пользователя через Telegram

    static async handleTelegramAuth(req, res) {
        try {
            const telegramData = req.body;

            // Проверяем наличие необходимых данных
            if (!telegramData || !telegramData.id) {
                return res.status(400).json({ 
                    error: 'Отсутствуют необходимые данные авторизации' 
                });
            }

            // Проверяем валидность данных от Telegram
            if (!User.validateTelegramHash(telegramData)) {
                return res.status(401).json({
                    error: 'Невалидные данные авторизации'
                });
            }

            // Проверяем время авторизации (не более 24 часов)
            const authTimestamp = parseInt(telegramData.auth_date);
            const currentTimestamp = Math.floor(Date.now() / 1000);
            if (currentTimestamp - authTimestamp > 86400) {
                return res.status(401).json({
                    error: 'Срок действия данных авторизации истек'
                });
            }

            // Создаем или обновляем пользователя
            const user = await User.createOrUpdateFromTelegram(telegramData);

            // Проверяем, есть ли у пользователя стандартные категории
            const categories = await Category.getAllByUserId(user.user_id);
            if (!categories || categories.length === 0) {
                // Если категорий нет, создаем стандартные
                await Category.createDefaultCategory(user.user_id);
            }

            // Генерируем JWT токен для пользователя
            const token = User.generateToken(user);

            res.json({
                user,
                token
            });
        } catch (error) {
            console.error('Error in handleTelegramAuth:', error);
            res.status(500).json({ 
                error: 'Ошибка при авторизации через Telegram' 
            });
        }
    }

    //Проверяет валидность токена и обновляет данные пользователя

    static async validateAndRefreshToken(req, res) {
        try {
            const userId = req.user.user_id;
            const user = await User.getById(userId);

            if (!user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }

            // Генерируем новый токен
            const token = User.generateToken(user);

            res.json({
                user,
                token
            });
        } catch (error) {
            console.error('Error in validateAndRefreshToken:', error);
            res.status(500).json({ 
                error: 'Ошибка при обновлении токена' 
            });
        }
    }

    //Обрабатывает выход пользователя

    static async handleLogout(req, res) {
        try {
            // В будущем здесь может быть логика для инвалидации токена
            // или обновления статуса пользователя
            res.json({ success: true });
        } catch (error) {
            console.error('Error in handleLogout:', error);
            res.status(500).json({ error: 'Ошибка при выходе из системы' });
        }
    }
}

module.exports = TelegramController;
