const { Telegraf, Markup } = require('telegraf');
const config = require('../config/config');
const db = require('./db');

// Добавляем поддержку сессий
const { session } = require('telegraf');

// Инициализация бота с токеном
const bot = new Telegraf(config.telegramToken);

// Подключаем middleware для работы с сессиями
bot.use(session());

// Глобальный объект для хранения задач
let users = {};

// Глобальная переменная для хранения категорий
let categories = {};

// Создадим функцию для инициализации данных нового пользователя
function initializeUserData(userId) {
    if (!users[userId]) {
        users[userId] = {
            tasks: {
                active: [],
                completed: []
            },
            categories: {
                'other': {
                    id: 'other',
                    name: 'Общее',
                    color: '#607D8B'
                },
                'work': {
                    id: 'work',
                    name: 'Работа',
                    color: '#FF5252'
                },
                'personal': {
                    id: 'personal',
                    name: 'Личное',
                    color: '#69F0AE'
                },
                'shopping': {
                    id: 'shopping',
                    name: 'Покупки',
                    color: '#448AFF'
                }
            }
        };
    }
    return users[userId];
}

// Функция загрузки категорий
async function loadCategories(userId) {
    try {
        const userCategories = await db.getUserCategories(userId);
        categories = userCategories.reduce((acc, category) => {
            acc[category.category_id] = category;
            return acc;
        }, {});
    } catch (error) {
        console.error('Ошибка при загрузке категорий:', error);
    }
}

// Форматирование даты
function formatDate(dateString) {
    if (!dateString) return 'Без срока';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Функция создания календаря
function createCalendarKeyboard(selectedDate = null, isNotification = false) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentDate = selectedDate ? new Date(selectedDate) : new Date();
    
    const keyboard = [];
    const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    
    // Добавляем заголовок с месяцем и годом и кнопки навигации
    keyboard.push([
        Markup.button.callback('←', `calendar:${currentDate.getFullYear()}:${currentDate.getMonth()}:prev`),
        Markup.button.callback(
            `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`,
            'ignore'
        ),
        Markup.button.callback('→', `calendar:${currentDate.getFullYear()}:${currentDate.getMonth()}:next`)
    ]);
    
    // Добавляем дни недели
    keyboard.push(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day =>
        Markup.button.callback(day, 'ignore')
    ));
    
    // Получаем первый день месяца
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    let startingDay = firstDay.getDay() || 7; // Преобразуем 0 (воскресенье) в 7
    startingDay--; // Корректируем для начала недели с понедельника
    
    // Получаем количество дней в месяце
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    
    // Создаем массив для дней
    let days = [];
    
    // Добавляем пустые ячейки в начале
    for (let i = 0; i < startingDay; i++) {
        days.push(Markup.button.callback(' ', 'ignore'));
    }
    
    // Добавляем дни месяца
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        date.setHours(0, 0, 0, 0);
        
        // Форматируем дату для callback_data
        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const displayDay = String(day).padStart(2, '0');
        
        // Определяем, активна ли кнопка
        const isDisabled = date < today;
        
        if (isDisabled) {
            days.push(Markup.button.callback(displayDay, 'ignore'));
        } else {
            const callbackPrefix = isNotification ? 'select_notification_date' : 'select_date';
            days.push(Markup.button.callback(displayDay, `${callbackPrefix}:${formattedDate}`));
        }
        
        // Начинаем новую строку после воскресенья
        if ((startingDay + day) % 7 === 0) {
            keyboard.push(days);
            days = [];
        }
    }
    
    // Добавляем оставшиеся дни
    if (days.length > 0) {
        // Добавляем пустые ячейки в конце
        while (days.length < 7) {
            days.push(Markup.button.callback(' ', 'ignore'));
        }
        keyboard.push(days);
    }
    
    // Добавляем кнопку "Без даты" только для обычных задач
    if (!isNotification) {
        keyboard.push([Markup.button.callback('Без даты', 'select_date:no_date')]);
    }
    
    return Markup.inlineKeyboard(keyboard);
}

// Обработчик команды /start
bot.command('start', async (ctx) => {
    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        const keyboard = Markup.keyboard([
            ['➕ Добавить задачу', '📋 Список задач'],
            ['🏷 Категории', '📊 Статистика'],
            ['❓ Помощь']
        ]).resize();

        ctx.reply('Добро пожаловать! Выберите действие:', keyboard);
    } catch (error) {
        console.error('Ошибка при запуске бота:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// Команда /add
bot.command('add', (ctx) => startAddingTask(ctx));

// Команда /help
bot.command('help', (ctx) => {
    ctx.reply(
        'Список доступных команд:\n\n' +
        '/add - Добавить новую задачу\n' +
        '/list - Показать список задач\n' +
        '/categories - Управление категориями\n' +
        '/stats - Показать статистику\n' +
        '/help - Показать эту справку\n\n' +
        'Для управления задачами используйте кнопки под сообщениями.'
    );
});

// Команда /list
bot.command('list', (ctx) => showTasksList(ctx));

// Команда /categories
bot.command('categories', (ctx) => showCategories(ctx));

// Команда /stats
bot.command('stats', (ctx) => showStats(ctx));

// Обработка кнопок главного меню
bot.hears('➕ Добавить задачу', (ctx) => startAddingTask(ctx));
bot.hears('📋 Список задач', (ctx) => showTasksList(ctx));
bot.hears('🏷 Категории', (ctx) => showCategories(ctx));
bot.hears('📊 Статистика', (ctx) => showStats(ctx));
bot.hears('❓ Помощь', (ctx) => {
    ctx.reply(
        'Список доступных команд:\n\n' +
        '/add - Добавить новую задачу\n' +
        '/list - Показать список задач\n' +
        '/categories - Управление категориями\n' +
        '/stats - Показать статистику\n' +
        '/help - Показать эту справку\n\n' +
        'Для управления задачами используйте кнопки под сообщениями.'
    );
});

// Функция добавления новой задачи
async function startAddingTask(ctx) {
    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        // Загружаем категории перед началом добавления задачи
        await loadCategories(user.user_id);
        
        ctx.reply('Введите название задачи:');
        ctx.session = {
            state: 'waiting_task_name',
            userId: user.user_id
        };
    } catch (error) {
        console.error('Ошибка при начале добавления задачи:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
}

// Функция отображения списка задач
async function showTasksList(ctx) {
    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        // Загружаем категории перед отображением списка
        await loadCategories(user.user_id);

        const tasks = await db.getUserTasks(user.user_id);

        let message = '📋 <b>Список задач</b>\n\n';

        if (tasks.active.length > 0) {
            message += '📌 <b>Активные задачи:</b>\n';
            message += tasks.active.map((task, index) => 
                formatTaskForList(task)
            ).join('\n');
        } else {
            message += 'Нет активных задач\n';
        }

        message += '\n';

        if (tasks.completed.length > 0) {
            message += '✅ <b>Выполненные задачи:</b>\n';
            message += tasks.completed.map((task, index) => 
                formatTaskForList(task)
            ).join('\n');
        } else {
            message += 'Нет выполненных задач\n';
        }

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📝 Управление задачами', 'manage_tasks')],
            [Markup.button.callback('➕ Добавить задачу', 'add_task')],
            [Markup.button.callback('« Назад', 'back_to_menu')]
        ]);

        await ctx.reply(message, {
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (error) {
        console.error('Ошибка при отображении списка задач:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
}

// Функция отображения списка задач для управления
async function showTasksForManagement(ctx) {
    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        const tasks = await db.getUserTasks(user.user_id);
        const keyboard = [];

        // Добавляем активные задачи
        if (tasks.active.length > 0) {
            keyboard.push([Markup.button.callback('📋 Активные задачи:', 'ignore')]);
            tasks.active.forEach(task => {
                keyboard.push([
                    Markup.button.callback(`📌 ${task.title}`, `view_task:${task.task_id}:active`)
                ]);
            });
        }

        // Добавляем выполненные задачи
        if (tasks.completed.length > 0) {
            keyboard.push([Markup.button.callback('✅ Выполненные задачи:', 'ignore')]);
            tasks.completed.forEach(task => {
                keyboard.push([
                    Markup.button.callback(`✓ ${task.title}`, `view_task:${task.task_id}:completed`)
                ]);
            });
        }

        // Добавляем кнопку возврата
        keyboard.push([Markup.button.callback('◀️ Назад', 'back_to_tasks')]);

        ctx.reply('Выберите задачу для управления:', Markup.inlineKeyboard(keyboard));

    } catch (error) {
        console.error('Ошибка при отображении задач для управления:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
}

// Функция отображения конкретной задачи
async function showTaskDetails(ctx, taskId, status) {
    try {
        const task = await db.getTaskById(taskId);
        if (!task) {
            ctx.reply('Задача не найдена');
            return;
        }

        // Загружаем категории перед отображением деталей
        await loadCategories(task.user_id);

        const category = categories[task.category_id] || { name: 'Без категории' };
        const statusEmoji = task.status === 'completed' ? '✅' : '📝';

        let message = `${statusEmoji} <b>${task.title}</b>\n\n`;
        
        // Добавляем описание задачи, если оно есть
        if (task.description && task.description.trim()) {
            message += `📄 Описание:\n${task.description}\n\n`;
        }
        
        message += `🏷 Категория: ${category.name}\n`;
        message += `📅 Срок: ${formatDate(task.due_date)}\n`;
        
        // Добавляем информацию об уведомлениях
        if (task.notifications_enabled) {
            const notificationTime = task.notification_time ? 
                new Date(task.notification_time).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : 'Не задано';
            message += `🔔 Уведомление: ${notificationTime}\n`;
        } else {
            message += '🔕 Уведомления выключены\n';
        }

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✏️ Изменить название', `edit_title:${taskId}`),
                Markup.button.callback('📅 Изменить дату', `change_date:${taskId}`)
            ],
            [
                Markup.button.callback('🏷 Изменить категорию', `change_category:${taskId}`),
                Markup.button.callback('🔔 Настройка уведомлений', `notifications:${taskId}`)
            ],
            [
                Markup.button.callback('📝 Изменить описание', `edit_description:${taskId}`)
            ],
            [
                task.status === 'completed' 
                    ? Markup.button.callback('↩️ Вернуть в активные', `uncomplete:${taskId}`)
                    : Markup.button.callback('✅ Отметить выполненной', `complete:${taskId}`)
            ],
            [
                Markup.button.callback('🗑 Удалить задачу', `delete:${taskId}`),
                Markup.button.callback('« Назад', 'back_to_list')
            ]
        ]);

        await ctx.reply(message, { 
            parse_mode: 'HTML',
            ...keyboard 
        });
    } catch (error) {
        console.error('Ошибка при показе деталей задачи:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
}

// Обработчики действий с задачами
bot.action('manage_tasks', (ctx) => showTasksForManagement(ctx));
bot.action('add_task', (ctx) => startAddingTask(ctx));
bot.action('back_to_tasks', (ctx) => showTasksList(ctx));
bot.action('back_to_task_list', (ctx) => showTasksForManagement(ctx));

// Обработчик просмотра задачи
bot.action(/^view_task:(\d+):(active|completed)$/, (ctx) => {
    const [taskId, status] = ctx.match.slice(1);
    showTaskDetails(ctx, taskId, status);
});

// Обработчики действий с конкретной задачей
bot.action(/^edit_title:(\d+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    ctx.session = {
        state: 'waiting_new_title',
        taskId: taskId
    };
    ctx.reply('Введите новое название задачи:');
});

// Обработчик изменения даты
bot.action(/^change_date:(\d+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        ctx.session = {
            state: 'waiting_new_date',
            taskId: taskId
        };
        await ctx.reply('Выберите новую дату:', {
            parse_mode: 'HTML',
            ...createCalendarKeyboard()
        });
    } catch (error) {
        console.error('Ошибка при изменении даты:', error);
        await ctx.reply('Произошла ошибка при изменении даты');
    }
});

// Обработчик изменения категории
bot.action(/^change_category:(\d+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        const categories = await db.getUserCategories(user.user_id);
        const keyboard = Markup.inlineKeyboard([
            ...categories.map(category => [
                Markup.button.callback(category.name, `set_category:${taskId}:${category.category_id}`)
            ]),
            [Markup.button.callback('« Назад', `show_task:${taskId}`)]
        ]);

        await ctx.editMessageText('Выберите новую категорию:', keyboard);
    } catch (error) {
        console.error('Ошибка при изменении категории:', error);
        await ctx.answerCbQuery('Произошла ошибка при изменении категории');
    }
});

// Обработчик выбора новой категории
bot.action(/^set_category:(\d+):(.+)$/, async (ctx) => {
    try {
        const [taskId, categoryId] = ctx.match.slice(1);
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        await db.updateTaskCategory(taskId, categoryId, user.user_id);
        await ctx.answerCbQuery('Категория задачи изменена');
        await showTaskDetails(ctx, taskId, 'active');
    } catch (error) {
        console.error('Ошибка при установке категории:', error);
        await ctx.answerCbQuery('Произошла ошибка при изменении категории');
    }
});

bot.action(/^delete:(\d+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        await db.deleteTask(taskId, user.user_id);
        await ctx.answerCbQuery('Задача удалена');
        await showTasksList(ctx);
    } catch (error) {
        console.error('Ошибка при удалении задачи:', error);
        await ctx.answerCbQuery('Произошла ошибка при удалении задачи');
    }
});

bot.action(/^complete_task:(\d+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        // Получаем текущие задачи
        const tasks = await db.getUserTasks(user.user_id);
        const maxCompletedOrder = tasks.completed.reduce((max, task) => 
            Math.max(max, task.order || 0), -1);

        // Отмечаем задачу как выполненную и устанавливаем ей order = 0
        await db.completeTask(taskId, user.user_id, 0);

        // Сдвигаем порядок остальных выполненных задач
        if (tasks.completed.length > 0) {
            const updatePromises = tasks.completed.map(t => 
                db.updateTaskOrder(t.task_id, (t.order || 0) + 1)
            );
            await Promise.all(updatePromises);
        }

        // Обновляем порядок оставшихся активных задач
        const activeTask = tasks.active.find(t => t.task_id === parseInt(taskId));
        if (activeTask) {
            const tasksToUpdate = tasks.active.filter(t => 
                (t.order || 0) > (activeTask.order || 0)
            );
            const updatePromises = tasksToUpdate.map(t => 
                db.updateTaskOrder(t.task_id, (t.order || 0) - 1)
            );
            await Promise.all(updatePromises);
        }

        ctx.reply('Задача отмечена как выполненная');
        showTasksForManagement(ctx);
    } catch (error) {
        console.error('Ошибка при выполнении задачи:', error);
        ctx.reply('Произошла ошибка при выполнении задачи');
    }
});

bot.action(/^uncomplete_task:(\d+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        // Получаем текущие задачи
        const tasks = await db.getUserTasks(user.user_id);
        const maxActiveOrder = tasks.active.reduce((max, task) => 
            Math.max(max, task.order || 0), -1);

        // Возвращаем задачу в активные и устанавливаем ей order = 0
        await db.uncompleteTask(taskId, user.user_id, 0);

        // Сдвигаем порядок остальных активных задач
        if (tasks.active.length > 0) {
            const updatePromises = tasks.active.map(t => 
                db.updateTaskOrder(t.task_id, (t.order || 0) + 1)
            );
            await Promise.all(updatePromises);
        }

        // Обновляем порядок оставшихся выполненных задач
        const completedTask = tasks.completed.find(t => t.task_id === parseInt(taskId));
        if (completedTask) {
            const tasksToUpdate = tasks.completed.filter(t => 
                (t.order || 0) > (completedTask.order || 0)
            );
            const updatePromises = tasksToUpdate.map(t => 
                db.updateTaskOrder(t.task_id, (t.order || 0) - 1)
            );
            await Promise.all(updatePromises);
        }

        ctx.reply('Задача возвращена в активные');
        showTasksForManagement(ctx);
    } catch (error) {
        console.error('Ошибка при возврате задачи в активные:', error);
        ctx.reply('Произошла ошибка при возврате задачи в активные');
    }
});

// Функция отображения категорий
async function showCategories(ctx) {
    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        const categories = await db.getUserCategories(user.user_id);
        const categoriesList = categories.map(cat =>
            `🏷 ${cat.name}`
        ).join('\n');

        ctx.reply(
            '🏷 Категории:\n\n' + categoriesList,
            Markup.inlineKeyboard([
                [Markup.button.callback('Добавить категорию', 'add_category')],
                [Markup.button.callback('Показать задачи по категории', 'show_by_category')]
            ])
        );
    } catch (error) {
        console.error('Ошибка при отображении категорий:', error);
        ctx.reply('Произошла ошибка при загрузке категорий. Пожалуйста, попробуйте позже.');
    }
}

// Функция отображения статистики
async function showStats(ctx) {
    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        const tasks = await db.getUserTasks(user.user_id);
        const totalTasks = tasks.active.length + tasks.completed.length;
        const activeTasksCount = tasks.active.length;
        const completedTasksCount = tasks.completed.length;

        const completionRate = totalTasks > 0
            ? Math.round((completedTasksCount / totalTasks) * 100)
            : 0;

        const message = 
            '📊 Статистика:\n\n' +
            `Всего задач: ${totalTasks}\n` +
            `Активных: ${activeTasksCount}\n` +
            `Выполненных: ${completedTasksCount}\n` +
            `Процент выполнения: ${completionRate}%`;

        ctx.reply(message);
    } catch (error) {
        console.error('Ошибка при отображении статистики:', error);
        ctx.reply('Произошла ошибка при загрузке статистики. Пожалуйста, попробуйте позже.');
    }
}

// Обработчики текстовых сообщений
bot.on('text', async (ctx) => {
    if (!ctx.session?.state) return;

    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        switch (ctx.session.state) {
            case 'waiting_task_name':
                ctx.session.newTask = {
                    title: ctx.message.text,
                    userId: user.user_id
                };
                const categories = await db.getUserCategories(user.user_id);
                const categoryButtons = categories.map(cat => [
                    Markup.button.callback(cat.name, `select_category:${cat.category_id}`)
                ]);
                await ctx.reply('Выберите категорию:', Markup.inlineKeyboard(categoryButtons));
                ctx.session.state = 'waiting_category';
                break;

            case 'waiting_new_title':
                const taskId = ctx.session.taskId;
                const newTitle = ctx.message.text;

                try {
                    await db.updateTaskTitle(taskId, newTitle);
                    ctx.session = {};
                    showTaskDetails(ctx, taskId, 'active');
                } catch (error) {
                    console.error('Ошибка при обновлении названия задачи:', error);
                    ctx.reply('Произошла ошибка при обновлении названия задачи');
                }
                break;

            case 'waiting_new_description':
                const descTaskId = ctx.session.taskId;
                const newDescription = ctx.message.text === '-' ? '' : ctx.message.text;

                try {
                    await db.updateTaskDescription(descTaskId, newDescription);
                    ctx.session = {};
                    await ctx.reply('Описание задачи обновлено');
                    showTaskDetails(ctx, descTaskId, 'active');
                } catch (error) {
                    console.error('Ошибка при обновлении описания задачи:', error);
                    ctx.reply('Произошла ошибка при обновлении описания задачи');
                }
                break;

            case 'waiting_category_name':
                const categoryName = ctx.message.text.trim();

                // Проверяем, нет ли уже категории с таким именем
                const existingCategories = await db.getUserCategories(user.user_id);
                const exists = existingCategories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase());
                
                if (exists) {
                    await ctx.reply('Категория с таким названием уже существует. Пожалуйста, выберите другое название.');
                    return;
                }

                // Список стандартных цветов для новых категорий
                const colorPalette = [
                    '#FF5252', '#FFD740', '#69F0AE', '#448AFF', '#B388FF',
                    '#FF80AB', '#7C4DFF', '#64FFDA', '#FF8A80', '#EA80FC',
                    '#8C9EFF', '#80D8FF', '#A7FFEB', '#CCFF90', '#FFFF8D'
                ];

                const randomColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];
                
                try {
                    // Создаем новую категорию в базе данных
                    await db.createCategory(user.user_id, categoryName, randomColor);
                    await ctx.reply(`Категория "${categoryName}" успешно создана! 🎨`);
                    
                    // Показываем обновленный список категорий
                    showCategories(ctx);
                } catch (error) {
                    console.error('Ошибка при создании категории:', error);
                    await ctx.reply('Произошла ошибка при создании категории. Пожалуйста, попробуйте позже.');
                }
                
                delete ctx.session;
                break;

            case 'entering_notification_time':
                const timeInput = ctx.message.text.trim();
                const timeMatch = timeInput.match(/^(\d{1,2}):(\d{1,2})$/);

                if (!timeMatch) {
                    await ctx.reply(
                        'Неверный формат времени!\n' +
                        'Пожалуйста, используйте формат ЧЧ:ММ\n' +
                        'Например: 08:00 или 14:30'
                    );
                    return;
                }

                const notificationTaskId = ctx.session.taskId;
                const selectedDate = ctx.session.selectedDate;
                const task = await db.getTaskById(notificationTaskId);
                
                if (!task) {
                    ctx.reply('Задача не найдена');
                    return;
                }

                // Парсим время
                const [_, hours, minutes] = timeMatch;
                const hoursNum = parseInt(hours);
                const minutesNum = parseInt(minutes);

                if (hoursNum < 0 || hoursNum > 23 || minutesNum < 0 || minutesNum > 59) {
                    await ctx.reply(
                        'Указано некорректное время.\n' +
                        'Часы: от 00 до 23\n' +
                        'Минуты: от 00 до 59'
                    );
                    return;
                }

                // Создаем дату уведомления
                const notificationTime = new Date(selectedDate);
                notificationTime.setHours(hoursNum, minutesNum, 0, 0);

                // Проверяем, что время не в прошлом
                const now = new Date();
                if (notificationTime < now) {
                    await ctx.reply(
                        'Нельзя установить уведомление на прошедшее время.\n' +
                        'Пожалуйста, укажите будущее время.'
                    );
                    return;
                }

                // Обновляем настройки уведомлений
                const updatedTask = await db.updateTaskNotifications(notificationTaskId, {
                    notifications_enabled: true,
                    notification_time: notificationTime.toISOString(),
                    notification_sent: false // Сбрасываем флаг отправки уведомления
                });

                if (!updatedTask) {
                    throw new Error('Не удалось обновить настройки уведомлений');
                }

                // Очищаем состояние сессии
                ctx.session = {};

                // Показываем сообщение об успехе и обновленные настройки
                await ctx.reply('✅ Время уведомления успешно установлено');

                // Показываем обновленные настройки уведомлений
                let message = '🔔 <b>Настройка уведомлений</b>\n\n';
                message += `Задача: ${task.title}\n`;
                message += `Установлено уведомление на: ${notificationTime.toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}`;

                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('🔕 Выключить уведомления', `toggle_notifications:${notificationTaskId}`)],
                    [Markup.button.callback('⏰ Изменить время', `set_notification_time:${notificationTaskId}`)],
                    [Markup.button.callback('« Назад к задаче', `show_task:${notificationTaskId}`)]
                ]);

                await ctx.reply(message, {
                    parse_mode: 'HTML',
                    ...keyboard
                });
                break;
        }
    } catch (error) {
        console.error('Ошибка при обработке текстового сообщения:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// Обработчик выбора категории для новой задачи
bot.action(/^select_category:(.+)$/, async (ctx) => {
    try {
        if (ctx.session?.state === 'waiting_category') {
            ctx.session.newTask.category = ctx.match[1];
            await ctx.reply('Выберите дату выполнения:', {
                parse_mode: 'HTML',
                ...createCalendarKeyboard()
            });
            ctx.session.state = 'waiting_date';
        }
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка при выборе категории:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// Функция для выбора типа задач
async function askTaskType(ctx, action) {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('Активные задачи', `select_type:active:${action}`)],
        [Markup.button.callback('Выполненные задачи', `select_type:completed:${action}`)]
    ]);
    
    const messages = {
        'delete': 'Выберите тип задач для удаления:',
        'change_date': 'Выберите тип задач для изменения даты:',
        'change_category': 'Выберите тип задач для изменения категории:',
        'change_status': 'Выберите задачи для изменения статуса:'
    };
    
    await ctx.reply(messages[action], keyboard);
}

// Обработчик выбора типа задач
bot.action(/select_type:(\w+):(\w+)/, async (ctx) => {
    try {
        const [_, type, action] = ctx.match;
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        const tasks = await db.getUserTasks(user.user_id);
        const tasksList = tasks[type].map((task, index) =>
            `${index + 1}. ${task.title}`
        ).join('\n');

        const actionMessages = {
            'delete': 'удаления',
            'change_date': 'изменения даты',
            'change_category': 'изменения категории',
            'change_status': type === 'active' ? 'отметки как выполненной' : 'отметки как активной'
        };

        await ctx.reply(
            `Выберите задачу для ${actionMessages[action]}:\n\n` +
            (tasksList || 'Нет задач') + '\n\n' +
            'Введите номер задачи:'
        );
        
        ctx.session = { 
            state: `waiting_${action}_number`,
            tasks: tasks[type],
            taskType: type
        };
    } catch (error) {
        console.error('Ошибка при выборе типа задач:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
    await ctx.answerCbQuery();
});

// Обработчик кнопки "Изменить статус"
bot.action('change_status', async (ctx) => {
    await askTaskType(ctx, 'change_status');
    await ctx.answerCbQuery();
});

// Обработчик кнопки "Удалить"
bot.action('delete_task', async (ctx) => {
    await askTaskType(ctx, 'delete');
    await ctx.answerCbQuery();
});

// Обработчик кнопки "Показать задачи по категории"
bot.action('show_by_category', async (ctx) => {
    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        const categories = await db.getUserCategories(user.user_id);
        const categoryButtons = categories.map(cat => [
            Markup.button.callback(`${cat.name}`, `show_category:${cat.category_id}`)
        ]);

        await ctx.reply('Выберите категорию для просмотра задач:',
            Markup.inlineKeyboard(categoryButtons)
        );
    } catch (error) {
        console.error('Ошибка при подготовке списка категорий:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
    await ctx.answerCbQuery();
});

// Обработчик выбора категории для просмотра
bot.action(/show_category:(.+)/, async (ctx) => {
    try {
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        const categoryId = ctx.match[1];
        const categories = await db.getUserCategories(user.user_id);
        const category = categories.find(c => c.category_id === categoryId);
        
        if (!category) {
            await ctx.reply('Категория не найдена');
            await ctx.answerCbQuery();
            return;
        }

        const tasks = await db.getUserTasks(user.user_id);
        
        const activeTasks = tasks.active
            .filter(task => task.category_id === categoryId)
            .map((task, index) =>
                `${index + 1}. ${task.title}\n📅 ${formatDate(task.due_date)}`
            ).join('\n');

        const completedTasks = tasks.completed
            .filter(task => task.category_id === categoryId)
            .map((task, index) =>
                `${index + 1}. ✅ ${task.title}\n📅 ${formatDate(task.due_date)}`
            ).join('\n');

        const message =
            `🏷 Задачи в категории "${category.name}":\n\n` +
            '📋 Активные задачи:\n' +
            (activeTasks || 'Нет активных задач') +
            '\n\n✅ Выполненные задачи:\n' +
            (completedTasks || 'Нет выполненных задач');

        await ctx.reply(message);
    } catch (error) {
        console.error('Ошибка при отображении задач категории:', error);
        ctx.reply('Произошла ошибка при загрузке задач. Пожалуйста, попробуйте позже.');
    }
    await ctx.answerCbQuery();
});

// Обработчик выбора даты из календаря
bot.action(/^select_date:(\d{4})-(\d{2})-(\d{2})$/, async (ctx) => {
    try {
        if (!ctx.session?.state) return;

        if (ctx.session.state === 'waiting_new_date') {
            // Обработка изменения даты существующей задачи
            const taskId = ctx.session.taskId;
            const [_, year, month, day] = ctx.match;
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            date.setHours(12, 0, 0, 0);
            const dueDate = date.toISOString();

            const user = await db.getOrCreateUser(
                ctx.from.id,
                ctx.from.username,
                ctx.from.first_name,
                ctx.from.last_name
            );

            await db.updateTaskDate(taskId, user.user_id, dueDate);
            await ctx.answerCbQuery('Дата задачи обновлена');
            delete ctx.session;
            await showTaskDetails(ctx, taskId, 'active');
        } else if (ctx.session.state === 'waiting_date') {
            // Обработка выбора даты для новой задачи
            const user = await db.getOrCreateUser(
                ctx.from.id,
                ctx.from.username,
                ctx.from.first_name,
                ctx.from.last_name
            );

            const [_, year, month, day] = ctx.match;
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            date.setHours(12, 0, 0, 0);
            const dueDate = date.toISOString();

            // Получаем текущие активные задачи для определения порядка
            const tasks = await db.getUserTasks(user.user_id);
            
            // Сдвигаем порядок существующих задач
            if (tasks.active.length > 0) {
                const updatePromises = tasks.active.map(t => 
                    db.updateTaskOrder(t.task_id, (t.order || 0) + 1)
                );
                await Promise.all(updatePromises);
            }

            // Создаем задачу с порядком 0 (в начале списка)
            const task = await db.createTask(
                user.user_id,
                ctx.session.newTask.title,
                ctx.session.newTask.category,
                dueDate,
                0 // Устанавливаем order = 0 для новой задачи
            );

            const categories = await db.getUserCategories(user.user_id);
            const category = categories.find(c => c.category_id === ctx.session.newTask.category);

            await ctx.editMessageText(
                'Задача успешно добавлена! 👍\n' +
                `Название: ${task.title}\n` +
                `Категория: ${category ? category.name : 'Без категории'}\n` +
                `Дата: ${formatDate(task.due_date)}`
            );

            delete ctx.session;
        }
    } catch (error) {
        console.error('Ошибка при обработке даты:', error);
        await ctx.answerCbQuery('Произошла ошибка при обработке даты');
    }
});

// Обработчик выбора "Без даты" для новой задачи
bot.action('select_date:no_date', async (ctx) => {
    try {
        if (ctx.session?.state !== 'waiting_date') return;

        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        // Получаем текущие активные задачи для определения порядка
        const tasks = await db.getUserTasks(user.user_id);
        
        // Сдвигаем порядок существующих задач
        if (tasks.active.length > 0) {
            const updatePromises = tasks.active.map(t => 
                db.updateTaskOrder(t.task_id, (t.order || 0) + 1)
            );
            await Promise.all(updatePromises);
        }

        // Создаем задачу с порядком 0 (в начале списка)
        const task = await db.createTask(
            user.user_id,
            ctx.session.newTask.title,
            ctx.session.newTask.category,
            null,
            0 // Устанавливаем order = 0 для новой задачи
        );

        const categories = await db.getUserCategories(user.user_id);
        const category = categories.find(c => c.category_id === ctx.session.newTask.category);

        await ctx.editMessageText(
            'Задача успешно добавлена! 👍\n' +
            `Название: ${task.title}\n` +
            `Категория: ${category ? category.name : 'Без категории'}\n` +
            'Дата: Без срока'
        );

        delete ctx.session;
    } catch (error) {
        console.error('Ошибка при создании задачи:', error);
        ctx.reply('Произошла ошибка при создании задачи');
    }
});

// Обработчик добавления новой категории
bot.action('add_category', async (ctx) => {
    await ctx.reply('Введите название новой категории:');
    ctx.session = { state: 'waiting_category_name' };
    await ctx.answerCbQuery();
});

// Обработчик навигации по календарю
bot.action(/calendar:(\d+):(\d+):(prev|next)/, async (ctx) => {
    const [_, yearStr, monthStr, direction] = ctx.match;
    let year = parseInt(yearStr);
    let month = parseInt(monthStr);

    if (direction === 'prev') {
        month--;
        if (month < 0) {
            month = 11;
            year--;
        }
    } else {
        month++;
        if (month > 11) {
            month = 0;
            year++;
        }
    }

    // Проверяем валидность даты
    const date = new Date(year, month);
    if (date.getFullYear() < new Date().getFullYear() - 1 ||
        date.getFullYear() > new Date().getFullYear() + 5) {
        await ctx.answerCbQuery('Выберите дату в пределах 5 лет');
        return;
    }

    const keyboard = createCalendarKeyboard(date);
    await ctx.editMessageReplyMarkup(keyboard.reply_markup);
    await ctx.answerCbQuery();
});

// Обработчик игнорируемых кнопок календаря
bot.action('ignore', (ctx) => ctx.answerCbQuery());

// Обработчик выбора новой даты для существующей задачи
bot.action(/select_date:(no_date|(\d+):(\d+):(\d+))/, async (ctx) => {
    if (ctx.session?.state === 'waiting_new_date' &&
        typeof ctx.session.taskToChange === 'number') {

        const match = ctx.match[1];
        const userId = ctx.from.id;
        const userData = initializeUserData(userId);
        const taskIndex = ctx.session.taskToChange;

        if (taskIndex >= 0 && taskIndex < userData.tasks.active.length) {
            if (match === 'no_date') {
                userData.tasks.active[taskIndex].dueDate = null;
            } else {
                const [year, month, day] = match.split(':').map(Number);
                const date = new Date(year, month, day);
                userData.tasks.active[taskIndex].dueDate = date.toISOString();
            }

            await ctx.editMessageText(
                'Дата задачи успешно изменена! 📅\n' +
                `Новая дата: ${formatDate(userData.tasks.active[taskIndex].dueDate)}`
            );
            showTasksList(ctx);
        }
    }

    delete ctx.session;
    await ctx.answerCbQuery();
});

// Обработчик выбора даты для новой задачи
bot.action(/^select_date:(\d+):(\d+):(\d+)$/, async (ctx) => {
    try {
        if (ctx.session?.state !== 'waiting_date') return;

        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        const [year, month, day] = ctx.match.slice(1).map(Number);
        const date = new Date(year, month, day);
        date.setHours(12, 0, 0, 0);
        const dueDate = date.toISOString();

        // Получаем текущие активные задачи для определения порядка
        const tasks = await db.getUserTasks(user.user_id);
        
        // Сдвигаем порядок существующих задач
        if (tasks.active.length > 0) {
            const updatePromises = tasks.active.map(t => 
                db.updateTaskOrder(t.task_id, (t.order || 0) + 1)
            );
            await Promise.all(updatePromises);
        }

        // Создаем задачу с порядком 0 (в начале списка)
        const task = await db.createTask(
            user.user_id,
            ctx.session.newTask.title,
            ctx.session.newTask.category,
            dueDate,
            0 // Устанавливаем order = 0 для новой задачи
        );

        const categories = await db.getUserCategories(user.user_id);
        const category = categories.find(c => c.category_id === ctx.session.newTask.category);

        await ctx.editMessageText(
            'Задача успешно добавлена! 👍\n' +
            `Название: ${task.title}\n` +
            `Категория: ${category ? category.name : 'Без категории'}\n` +
            `Дата: ${formatDate(task.due_date)}`
        );

        delete ctx.session;
    } catch (error) {
        console.error('Ошибка при создании задачи:', error);
        ctx.reply('Произошла ошибка при создании задачи');
    }
});

// Обработчик выбора "Без даты" для новой задачи
bot.action('select_date:no_date', async (ctx) => {
    try {
        if (ctx.session?.state !== 'waiting_date') return;

        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        // Получаем текущие активные задачи для определения порядка
        const tasks = await db.getUserTasks(user.user_id);
        
        // Сдвигаем порядок существующих задач
        if (tasks.active.length > 0) {
            const updatePromises = tasks.active.map(t => 
                db.updateTaskOrder(t.task_id, (t.order || 0) + 1)
            );
            await Promise.all(updatePromises);
        }

        // Создаем задачу с порядком 0 (в начале списка)
        const task = await db.createTask(
            user.user_id,
            ctx.session.newTask.title,
            ctx.session.newTask.category,
            null,
            0 // Устанавливаем order = 0 для новой задачи
        );

        const categories = await db.getUserCategories(user.user_id);
        const category = categories.find(c => c.category_id === ctx.session.newTask.category);

        await ctx.editMessageText(
            'Задача успешно добавлена! 👍\n' +
            `Название: ${task.title}\n` +
            `Категория: ${category ? category.name : 'Без категории'}\n` +
            'Дата: Без срока'
        );

        delete ctx.session;
    } catch (error) {
        console.error('Ошибка при создании задачи:', error);
        ctx.reply('Произошла ошибка при создании задачи');
    }
});

// Функция для генерации ID категории
function generateCategoryId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 4);
    return `cat_${timestamp}_${randomPart}`;
}

// Запускаем бота
bot.launch().then(() => {
    console.log('Бот запущен');
}).catch(err => {
    console.error('Ошибка при запуске бота:', err);
});

// Выключение бота
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 

module.exports = bot; 

function formatTaskForList(task, showButtons = true) {
    const statusEmoji = task.status === 'completed' ? '✅' : '📝';
    const category = categories[task.category_id] || { name: 'Без категории' };
    
    let text = `${statusEmoji} <b>${task.title}</b>\n`;
    text += `🏷 Категория: ${category.name}\n`;
    text += `📅 Срок: ${formatDate(task.due_date)}\n`;
    
    // Добавляем информацию об уведомлениях
    if (task.notifications_enabled) {
        const notificationTime = task.notification_time ? 
            new Date(task.notification_time).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'Не задано';
        text += `🔔 Уведомление: ${notificationTime}\n`;
    } else {
        text += '🔕 Уведомления выключены\n';
    }

    return text;
}

// Обработчик кнопки настройки уведомлений
bot.action(/^notifications:(\d+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const task = await db.getTaskById(taskId);
        
        if (!task) {
            ctx.reply('Задача не найдена');
            return;
        }

        // Загружаем категории
        await loadCategories(task.user_id);

        // Если задача выполнена, уведомления настраивать нельзя
        if (task.status === 'completed') {
            await ctx.answerCbQuery('Нельзя настроить уведомления для выполненной задачи');
            return;
        }

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    task.notifications_enabled ? '🔕 Выключить уведомления' : '🔔 Включить уведомления',
                    `toggle_notifications:${taskId}`
                )
            ],
            task.notifications_enabled ? [
                Markup.button.callback('⏰ Установить время', `set_notification_time:${taskId}`)
            ] : [],
            [Markup.button.callback('« Назад', `show_task:${taskId}`)]
        ]);

        let message = '🔔 <b>Настройка уведомлений</b>\n\n';
        message += `Задача: ${task.title}\n`;
        if (task.notifications_enabled) {
            const notificationTime = task.notification_time ? 
                new Date(task.notification_time).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : 'Не задано';
            message += `Текущее время уведомления: ${notificationTime}`;
        } else {
            message += 'Уведомления выключены';
        }

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (error) {
        console.error('Ошибка при настройке уведомлений:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// Обработчик включения/выключения уведомлений
bot.action(/^toggle_notifications:(\d+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const task = await db.getTaskById(taskId);
        
        if (!task) {
            ctx.reply('Задача не найдена');
            return;
        }

        const newState = !task.notifications_enabled;
        let notificationTime = null;

        // Если включаем уведомления и у задачи есть дата, устанавливаем время на 8:00
        if (newState && task.due_date) {
            const date = new Date(task.due_date);
            date.setHours(8, 0, 0, 0);
            notificationTime = date.toISOString();
        }

        await db.updateTaskNotifications(taskId, {
            notifications_enabled: newState,
            notification_time: notificationTime
        });

        await ctx.answerCbQuery(newState ? 'Уведомления включены' : 'Уведомления выключены');

        // Показываем обновленные настройки уведомлений
        const updatedTask = await db.getTaskById(taskId);
        await loadCategories(updatedTask.user_id);

        let message = '🔔 <b>Настройка уведомлений</b>\n\n';
        message += `Задача: ${updatedTask.title}\n`;
        if (updatedTask.notifications_enabled) {
            const notificationTime = updatedTask.notification_time ? 
                new Date(updatedTask.notification_time).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : 'Не задано';
            message += `Текущее время уведомления: ${notificationTime}`;
        } else {
            message += 'Уведомления выключены';
        }

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    updatedTask.notifications_enabled ? '🔕 Выключить уведомления' : '🔔 Включить уведомления',
                    `toggle_notifications:${taskId}`
                )
            ],
            updatedTask.notifications_enabled ? [
                Markup.button.callback('⏰ Установить время', `set_notification_time:${taskId}`)
            ] : [],
            [Markup.button.callback('« Назад', `show_task:${taskId}`)]
        ]);

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (error) {
        console.error('Ошибка при изменении состояния уведомлений:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// Обработчик кнопки установки времени уведомления
bot.action(/^set_notification_time:(\d+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const taskId = ctx.match[1];
        const task = await db.getTaskById(taskId);

        if (!task) {
            ctx.reply('Задача не найдена');
            return;
        }

        // Устанавливаем состояние сессии для выбора даты
        ctx.session = {
            state: 'selecting_notification_date',
            taskId: taskId
        };

        let message = '📅 <b>Установка уведомления</b>\n\n';
        message += 'Выберите дату уведомления:';

        // Создаем календарь для выбора даты
        const keyboard = createCalendarKeyboard(null, true);

        await ctx.reply(message, {
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (error) {
        console.error('Ошибка при запросе даты уведомления:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// Обработчик выбора даты из календаря для уведомления
bot.action(/^select_notification_date:(.+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const selectedDate = ctx.match[1];
        const taskId = ctx.session?.taskId;

        if (!taskId) {
            ctx.reply('Ошибка: не найден идентификатор задачи');
            return;
        }

        const task = await db.getTaskById(taskId);
        if (!task) {
            ctx.reply('Задача не найдена');
            return;
        }

        // Проверяем, что выбранная дата не в прошлом
        const selectedDateTime = new Date(selectedDate);
        const now = new Date();
        
        // Сбрасываем время до начала дня для корректного сравнения дат
        const selectedDateStart = new Date(selectedDateTime.getFullYear(), selectedDateTime.getMonth(), selectedDateTime.getDate());
        const nowDateStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (selectedDateStart < nowDateStart) {
            ctx.reply(
                'Нельзя установить уведомление на прошедшую дату.\n' +
                'Пожалуйста, выберите будущую дату.'
            );
            return;
        }

        // Проверяем, что дата не позже срока задачи
        if (task.due_date && selectedDateTime > new Date(task.due_date)) {
            ctx.reply(
                'Дата уведомления не может быть позже срока задачи.\n' +
                `Срок задачи: ${formatDate(task.due_date)}`
            );
            return;
        }

        // Сохраняем выбранную дату и переходим к вводу времени
        ctx.session = {
            state: 'entering_notification_time',
            taskId: taskId,
            selectedDate: selectedDate
        };

        let message = '⏰ <b>Установка времени уведомления</b>\n\n';
        message += `Выбранная дата: ${formatDate(selectedDate)}\n\n`;
        message += 'Введите время в формате ЧЧ:ММ\n';
        message += 'Например: 08:00';

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('« Отмена', `show_task:${taskId}`)]
        ]);

        await ctx.reply(message, {
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (error) {
        console.error('Ошибка при выборе даты уведомления:', error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// Обработчик кнопки "Назад" в главное меню
bot.action('back_to_menu', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const keyboard = Markup.keyboard([
            ['➕ Добавить задачу', '📋 Список задач'],
            ['🏷 Категории', '📊 Статистика'],
            ['❓ Помощь']
        ]).resize();

        await ctx.reply('Выберите действие:', keyboard);
    } catch (error) {
        console.error('Ошибка при возврате в главное меню:', error);
    }
});

// Обработчик кнопки "Назад" к списку задач
bot.action('back_to_list', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await showTasksList(ctx);
    } catch (error) {
        console.error('Ошибка при возврате к списку задач:', error);
    }
});

// Обработчик кнопки "Назад" к деталям задачи
bot.action(/^show_task:(\d+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const taskId = ctx.match[1];
        await showTaskDetails(ctx, taskId);
    } catch (error) {
        console.error('Ошибка при возврате к деталям задачи:', error);
    }
});

// Обработчик отметки задачи выполненной
bot.action(/^complete:(\d+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        await db.completeTask(taskId, user.user_id);
        await ctx.answerCbQuery('Задача отмечена как выполненная');
        await showTaskDetails(ctx, taskId, 'completed');
    } catch (error) {
        console.error('Ошибка при выполнении задачи:', error);
        await ctx.answerCbQuery('Произошла ошибка при выполнении задачи');
    }
});

// Обработчик возврата задачи в активные
bot.action(/^uncomplete:(\d+)$/, async (ctx) => {
    try {
        const taskId = ctx.match[1];
        const user = await db.getOrCreateUser(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        await db.uncompleteTask(taskId, user.user_id);
        await ctx.answerCbQuery('Задача возвращена в активные');
        await showTaskDetails(ctx, taskId, 'active');
    } catch (error) {
        console.error('Ошибка при возврате задачи в активные:', error);
        await ctx.answerCbQuery('Произошла ошибка при возврате задачи');
    }
});

// Обработчик изменения описания
bot.action(/^edit_description:(\d+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    ctx.session = {
        state: 'waiting_new_description',
        taskId: taskId
    };
    ctx.reply('Введите новое описание задачи:\n(Отправьте "-" чтобы удалить описание)');
}); 