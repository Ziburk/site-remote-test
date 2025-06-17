const API_BASE_URL = window.location.origin + '/api';

// Класс для работы с API
class TodoAPI {
    constructor() {
        this.token = localStorage.getItem('auth_token');
        
        // Добавляем слушатель для обновления токена
        window.addEventListener('storage', (e) => {
            if (e.key === 'auth_token') {
                this.token = e.newValue;
            }
        });
    }

    // Метод для установки токена
    setToken(token) {
        this.token = token;
        localStorage.setItem('auth_token', token);
    }

    // Базовый метод для выполнения запросов
    async fetchAPI(endpoint, options = {}) {
        if (!this.token) {
            window.location.href = '/login.html';
            throw new Error('Не авторизован');
        }

        const url = `${API_BASE_URL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Если токен недействителен, перенаправляем на страницу входа
                    window.location.href = '/login.html';
                    throw new Error('Недействительный токен');
                }
                const error = await response.json();
                throw new Error(error.error || 'API Error');
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Методы для работы с категориями
    async getCategories() {
        return this.fetchAPI('/categories');
    }

    async createDefaultCategories() {
        return this.fetchAPI('/categories/default', {
            method: 'POST'
        });
    }

    async createCategory(name, color) {
        return this.fetchAPI('/categories', {
            method: 'POST',
            body: JSON.stringify({ name, color })
        });
    }

    async updateCategory(categoryId, data) {
        return this.fetchAPI(`/categories/${categoryId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteCategory(categoryId) {
        return this.fetchAPI(`/categories/${categoryId}`, {
            method: 'DELETE'
        });
    }

    // Методы для работы с задачами
    async getTasks() {
        return this.fetchAPI('/tasks');
    }

    async findTask(taskId) {
        return this.fetchAPI(`/tasks/${taskId}`);
    }

    async createTask(taskData) {
        return this.fetchAPI('/tasks', {
            method: 'POST',
            body: JSON.stringify(taskData)
        });
    }

    async updateTask(taskId, taskData) {
        return this.fetchAPI(`/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify(taskData)
        });
    }

    async deleteTask(taskId) {
        return this.fetchAPI(`/tasks/${taskId}`, {
            method: 'DELETE'
        });
    }

    // Отметка задачи как выполненной
    async completeTask(taskId) {
        return this.fetchAPI(`/tasks/${taskId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'completed' })
        });
    }

    // Отметка задачи как невыполненной
    async uncompleteTask(taskId) {
        return this.fetchAPI(`/tasks/${taskId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'active' })
        });
    }

    /**
     * Обновляет порядок задач
     * @param {Array<{taskId: string, order: number}>} orderData - Массив с новым порядком задач
     * @returns {Promise<void>}
     */
    async updateTaskOrder(orderData) {
        return this.fetchAPI('/tasks/order', {
            method: 'PATCH',
            body: JSON.stringify({ orderData })
        });
    }

    /**
     * Получает данные о продуктивности за период
     * @param {Object} params - Параметры запроса
     * @param {string} params.startDate - Начальная дата
     * @param {string} params.endDate - Конечная дата
     * @returns {Promise<Array>} Массив с данными о продуктивности
     */
    async getProductivityData(params) {
        const queryParams = new URLSearchParams(params);
        return this.fetchAPI(`/tasks/stats/productivity?${queryParams.toString()}`);
    }

    /**
     * Обновляет настройки уведомлений задачи
     * @param {string} taskId - ID задачи
     * @param {Object} notificationSettings - Настройки уведомлений
     * @param {boolean} notificationSettings.notifications_enabled - Включены ли уведомления
     * @param {string|null} notificationSettings.notification_time - Время уведомления в ISO формате
     * @returns {Promise<Object>} Обновленная задача
     */
    async updateTaskNotifications(taskId, notificationSettings) {
        return this.fetchAPI(`/tasks/${taskId}/notifications`, {
            method: 'PATCH',
            body: JSON.stringify(notificationSettings)
        });
    }
}

// Создаем и экспортируем экземпляр API
const todoAPI = new TodoAPI();
window.todoAPI = todoAPI; // Делаем доступным глобально
export default todoAPI; 