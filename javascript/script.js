import '@toast-ui/editor/dist/toastui-editor.css';
import { Editor } from '@toast-ui/editor';
import Chart from 'chart.js/auto';
import todoAPI from './api.js';

//-----------------------------------------------------------------------------------
// Переменные и константы

// Глобальный объект для хранения задач
let tasks = {
    active: [],     //массив текущих задач
    completed: []   //массив выполненных задач
};

// Объект для хранения категорий
let categories = {};

// Переменная для списка активных редакторов текста
let activeEditors = {};

// Переменная, в которую записывается круговая диаграмма при ее инициализации
let pieChart = null;

// Список констант для определения типа диаграммы 
const CHART_TYPES = {
    COMPLETION: 'completion',   // диаграмма выполненные/невыполненные                       
    COMPLETED_BY_CATEGORY: 'completed-by-category',  // диаграмма выполненных с разбитием на категории      
    ACTIVE_BY_CATEGORY: 'active-by-category'    // диаграмма невыполненных с разбитием на категории
};

// Переменная, хранящая текущий тип диаграммы (по стандарту "выполненные/невыполненные")
let currentChartType = CHART_TYPES.COMPLETION;

// Переменная, в которую записывается график продуктивности при его инициализации
let productivityChart = null;

// Список констант для определения периода графика продуктивности
const PRODUCTIVITY_PERIODS = {
    LAST_7_DAYS: '7',
    LAST_14_DAYS: '14',
    LAST_30_DAYS: '30',
    CUSTOM: 'custom'
};

// Категория, которая будет даваться задачам по умолчанию
const defaultCategoryId = 'other';

// Переменные, связанные с фильтрацией категорий
let currentCategoryFilter = 'all';  // Фильтр по конкретной категории
let currentStatusFilter = 'all';    // Фильтр по статусу задачи (активная/завершенная)

// Константы для выбора задач для экспорта
const EXPORT_TYPES = {
    SELECTED: 'selected',
    ALL_TASKS: 'all-tasks',
    ALL_COMPLETED: 'all-completed',
    ALL_ACTIVE: 'all-active',
    BY_DATE_RANGE: 'by-date-range'
};

// Константы для типов диаграммы в экспорте
const EXPORT_CHART_TYPES = {
    NONE: 'none',
    COMPLETION: 'completion',
    BY_CATEGORY: 'by-category'
};

// Константы для графика продуктивности в экспорте
const EXPORT_PRODUCTIVITY_TYPES = {
    NONE: 'none',
    LAST_7_DAYS: '7',
    LAST_14_DAYS: '14',
    LAST_30_DAYS: '30',
    CUSTOM: 'custom'
};


//-----------------------------------------------------------------------------------

//-----------------------------------------------------------------------------------
// Функции

// Главная функция всей программы. Инициализация компонентов и присваивание событий
const init = async () => {
    try {
        // Проверяем авторизацию
        const token = localStorage.getItem('auth_token');
        const savedUser = localStorage.getItem('telegramUser');
        
        if (!token || !savedUser) {
            window.location.href = '/login.html';
            return;
        }

        // Проверяем валидность токена
        try {
            const response = await fetch('/api/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Токен недействителен');
            }

            // Обновляем UI для авторизованного пользователя
            updateUIForLoggedInUser(JSON.parse(savedUser));
        } catch (error) {
            console.error('Ошибка проверки токена:', error);
            window.location.href = '/login.html';
            return;
        }
        
        // Загружаем данные
        await loadCategories();
        await loadTasks();
        
        initTabs();
        setupDragAndDrop();

        // Добавляем обработчики событий
        // Кнопка добавления задачи
        document.querySelector('.add-task-button').addEventListener('click', addTask);

        // Кнопка экспорта в PDF
        document.querySelector('.export-button').addEventListener('click', initExportModal);

        // Кнопка управления категориями
        document.getElementById('category-manager-btn').addEventListener('click', showCategoryManager);

        // Обработчики для фильтров
        document.getElementById('category-filter').addEventListener('change', () => {
            currentCategoryFilter = document.getElementById('category-filter').value;
            renderTasks();
        });

        document.getElementById('date-filter').addEventListener('change', renderTasks);
        document.getElementById('clear-date-filter').addEventListener('click', () => {
            document.getElementById('date-filter').value = '';
            renderTasks();
        });

        document.getElementById('date-sort').addEventListener('change', renderTasks);

        // Обработчики для фильтра по статусу
        document.querySelectorAll('input[name="status"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                currentStatusFilter = e.target.value;
                renderTasks();
            });
        });

        // Обработчики для списков задач
        const taskLists = document.querySelectorAll('.task-list');
        taskLists.forEach(list => {
            // Делегирование событий для задач
            list.addEventListener('click', async (e) => {
                const taskElement = e.target.closest('.task');
                if (!taskElement) return;

                // Обработка чекбокса (выполнение задачи)
                if (e.target.classList.contains('task-comp') || e.target.classList.contains('check-label')) {
                    await completeTask(e);
                }
                // Кнопка редактирования
                else if (e.target.closest('.task-change')) {
                    changeTask(e);
                }
                // Кнопка изменения даты
                else if (e.target.closest('.task-change-date')) {
                    changeTaskDate(e);
                }
                // Кнопка удаления
                else if (e.target.closest('.task-delete')) {
                    await deleteTask(e);
                }
                // Кнопка раскрытия описания
                else if (e.target.closest('.task-open-description')) {
                    const descBlock = taskElement.querySelector('.task-description');
                    const descButton = taskElement.querySelector('.task-open-description');
                    
                    descBlock.classList.toggle('hidden');
                    descButton.classList.toggle('rotated');
                }
                // Кнопка редактирования описания
                else if (e.target.closest('.task-description-text')) {
                    initEditorForTask(taskElement);
                }
                // Кнопка сохранения описания
                else if (e.target.closest('.save-description-btn')) {
                    await saveTaskDescription(e);
                }
                // Кнопка отмены редактирования описания
                else if (e.target.closest('.cancel-description-btn')) {
                    cancelTaskDescriptionEditing(e);
                }
            });
        });

        // Обработчики для графиков на вкладке статистики
        document.getElementById('chart-type').addEventListener('change', (e) => {
            currentChartType = e.target.value;
            initPieChart();
        });

        document.getElementById('productivity-period').addEventListener('change', (e) => {
            const customPeriod = document.getElementById('custom-period-selector');
            customPeriod.classList.toggle('hidden', e.target.value !== PRODUCTIVITY_PERIODS.CUSTOM);
            
            if (e.target.value !== PRODUCTIVITY_PERIODS.CUSTOM) {
                updateProductivityChart();
            }
        });

        document.getElementById('apply-custom-period').addEventListener('click', updateProductivityChart);

        // Если открыта вкладка статистики, инициализируем графики
        if (document.getElementById('statistics').classList.contains('active')) {
            initPieChart();
            initProductivityChart();
        }

    } catch (error) {
        console.error('Ошибка инициализации:', error);
        window.location.href = '/login.html';
    }
};

// Функция обновления информации
function updateUI() {
    const filtersState = saveFiltersState();  // Сохраняем состояние фильтров
    updateCategorySelectors();  // Обновление всех выпадающих списков категорий
    restoreFiltersState(filtersState);  // Восстанавливаем состояние фильтров
    renderTasks();  // Отрисовка всех задач
    updateStats();  // Обновление статистики на вкладке "Статистика"
}

// Функция загрузки категорий с сервера
async function loadCategories() {
    try {
        const serverCategories = await todoAPI.getCategories();
        
        // Преобразуем массив категорий в объект для совместимости
        categories = serverCategories.reduce((acc, cat) => {
            acc[cat.category_id] = {
                id: cat.category_id,
                name: cat.name,
                color: cat.color,
                is_default: cat.is_default
            };
            return acc;
        }, {});

        // Если категорий нет, создаем стандартные
        if (Object.keys(categories).length === 0) {
            const defaultCategories = await todoAPI.createDefaultCategories();
            categories = defaultCategories.reduce((acc, cat) => {
                acc[cat.category_id] = {
                    id: cat.category_id,
                    name: cat.name,
                    color: cat.color,
                    is_default: cat.is_default
                };
                return acc;
            }, {});
        }

        updateCategorySelectors();
    } catch (error) {
        console.error('Ошибка при загрузке категорий:', error);
        throw error;
    }
}

// Функция загрузки задач с сервера
async function loadTasks() {
    try {
        const serverTasks = await todoAPI.getTasks();
        
        // Разделяем задачи на активные и выполненные
        tasks = {
            active: serverTasks.active || [],
            completed: serverTasks.completed || []
        };

        updateUI();
    } catch (error) {
        console.error('Ошибка при загрузке задач:', error);
        throw error;
    }
}

// Функция инициализации вкладок
function initTabs() {
    const tabs = document.querySelectorAll('.main-nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            if (tabId === 'statistics') {
                initPieChart();
                initProductivityChart();
            }
        });
    });

}

// Функция перетаскивания задачи
function setupDragAndDrop() {
    // Получаем списки активных и завершенных задач
    const taskLists = document.querySelectorAll('.task-list');

    let draggedItem = null; // "Взятая" задача
    let placeholder = null; // Пустой блок, вставаемый на прошлое место задачи
    let dragOverList = null; // Список, над которым происходит перемещение

    // Проходимся по каждому списку
    taskLists.forEach(list => {
        // Начало перетаскивания
        list.addEventListener('dragstart', (e) => {
            // Проверяем, что это активная задача
            if (e.target.classList.contains('task') && !e.target.classList.contains('completed-task')) {
                draggedItem = e.target;
                draggedItem.classList.add('dragging');

                // Создаем плейсхолдер
                placeholder = document.createElement('div');
                placeholder.className = 'task-placeholder';
                placeholder.style.height = `${draggedItem.offsetHeight}px`;

                // Задержка для плавного эффекта
                setTimeout(() => {
                    draggedItem.style.display = 'none';
                    draggedItem.parentNode.insertBefore(placeholder, draggedItem);
                }, 0);

                // Разрешено только перетаскивание
                e.dataTransfer.effectAllowed = 'move';
            } else {
                // Отменяем перетаскивание для выполненных задач
                e.preventDefault();
            }
        });

        // Элемент над зоной сброса
        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            // Проверка, что перетаскивание корректно
            if (!draggedItem || !placeholder || list.id !== 'current-tasks-list') return;

            // Добавляем класс для визуального выделения
            list.classList.add('drag-over');
            dragOverList = list;

            // Исключаем плейсхолдер из расчетов
            const siblings = [...list.children].filter(child => child !== placeholder);

            if (siblings.length === 0) {
                list.appendChild(placeholder);
                return;
            }

            // Находим элемент, перед которым нужно вставить
            const closestSibling = siblings.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = e.clientY - box.top - box.height / 2;

                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;

            if (closestSibling) {
                list.insertBefore(placeholder, closestSibling);
            } else {
                list.appendChild(placeholder);
            }
        });

        // Покинули зону сброса
        list.addEventListener('dragleave', (e) => {
            list.classList.remove('drag-over');
        });

        // Сброс элемента
        list.addEventListener('drop', async (e) => {
            e.preventDefault();

            if (!draggedItem || !placeholder || list.id !== 'current-tasks-list') return;

            // Вставляем перетаскиваемый элемент вместо плейсхолдера
            if (placeholder.parentNode) {
                placeholder.parentNode.replaceChild(draggedItem, placeholder);
            }

            draggedItem.style.display = '';
            list.classList.remove('drag-over');

            // Обновляем порядок задач в БД
            await updateTaskOrder(list);
        });

        // Завершение перетаскивания
        list.addEventListener('dragend', () => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem.style.display = '';

                // Удаляем плейсхолдер, если он остался
                if (placeholder && placeholder.parentNode) {
                    placeholder.parentNode.removeChild(placeholder);
                }

                if (dragOverList) {
                    dragOverList.classList.remove('drag-over');
                }

                draggedItem = null;
                placeholder = null;
                dragOverList = null;
            }
        });
    });
}

// Функция обновления порядка задач в БД
async function updateTaskOrder(list) {
    try {
        const taskElements = list.querySelectorAll('.task:not(.completed-task)');
        const orderData = [];

        taskElements.forEach((taskElement, index) => {
            const taskId = taskElement.dataset.taskId;
            if (taskId) {
                orderData.push({
                    taskId: taskId,
                    order: index
                });
            }
        });

        if (orderData.length > 0) {
            await todoAPI.updateTaskOrder(orderData);
        }
    } catch (error) {
        console.error('Ошибка при обновлении порядка задач:', error);
    }
}

// Функция отрисовки задач с учетом фильтров
function renderTasks() {
    // Получение списков задач
    const activeList = document.querySelector('#current-tasks-list');
    const completedList = document.querySelector('#completed-tasks-list');

    //Обнуление разметки этих списков
    activeList.innerHTML = '';
    completedList.innerHTML = '';

    // Отбор задач по критериям фильтрации
    const matchesFilters = (task, isCompleted) => {
        // Отбор по статусу (Активные/Завершенные)
        if (currentStatusFilter === 'active' && isCompleted) return false;
        if (currentStatusFilter === 'completed' && !isCompleted) return false;

        // Отбор по категориям
        if (currentCategoryFilter !== 'all') {
            const taskCategory = task.category_id || defaultCategoryId;
            if (taskCategory !== currentCategoryFilter) return false;
        }

        // Отбор по дате
        const dateFilter = document.getElementById('date-filter').value;
        if (dateFilter) {
            if (!task.due_date) return false;
            
            // Преобразуем дату фильтра в объект Date
            const filterDate = new Date(dateFilter);
            filterDate.setHours(0, 0, 0, 0);
            
            // Преобразуем дату задачи в объект Date в локальном часовом поясе
            const taskDate = new Date(task.due_date);
            taskDate.setHours(0, 0, 0, 0);
            
            // Сравниваем даты, игнорируя время
            if (taskDate.getTime() !== filterDate.getTime()) return false;
        }

        return true;
    };

    // Сортируем каждый из списков
    const activeTasks = sortTasksByDate([...tasks.active].filter(task => matchesFilters(task, false)));
    const completedTasks = sortTasksByDate([...tasks.completed].filter(task => matchesFilters(task, true)));

    // Рендерим с сохранением оригинальных индексов
    activeTasks.forEach((task) => {
        const originalIndex = tasks.active.findIndex(t => t.task_id === task.task_id);
        const taskElement = createTaskElement(task, originalIndex, false);
        activeList.appendChild(taskElement);
    });

    completedTasks.forEach((task) => {
        const originalIndex = tasks.completed.findIndex(t => t.task_id === task.task_id);
        const taskElement = createTaskElement(task, originalIndex, true);
        completedList.appendChild(taskElement);
    });

    // Выводим отобранные задачи
    document.querySelector('.current-tasks-title').textContent = `Текущие (${activeTasks.length})`;
    document.querySelector('.completed-tasks-title').textContent = `Выполненные (${completedTasks.length})`;
}

// Функция создания самой задачи
function createTaskElement(task, index, isCompleted) {
    // Создает задачу (элемент списка) и задаем есть параметры
    const taskElement = document.createElement('li');
    taskElement.className = `task task${index} ${isCompleted ? 'completed-task' : ''}`;
    taskElement.dataset.originalIndex = index;
    taskElement.dataset.isCompleted = isCompleted;
    taskElement.dataset.taskId = task.task_id; // Добавляем ID задачи
    taskElement.draggable = true;

    const categoryId = task.category_id || defaultCategoryId;
    taskElement.dataset.category = categoryId;
    const category = categories[categoryId] || categories[defaultCategoryId];

    // Создаем временный редактор для преобразования Markdown в HTML
    const tempContainer = document.createElement('div');
    const tempEditor = new toastui.Editor({
        el: tempContainer,
        initialValue: task.description || '',
        hidden: true
    });
    const htmlDescription = task.description ? tempEditor.getHTML() : 'Нет описания';
    tempEditor.destroy();

    const hasNotification = task.notification_time !== null && task.notification_time !== undefined;
    const notificationClass = hasNotification ? 'has-notification' : '';

    taskElement.innerHTML = `
    <div class="task-wrapper">
        <div class="task-title-wrapper">
            <input class="task-comp hidden" type="checkbox" name="task-comp" ${isCompleted ? 'checked' : ''}>
            <label class="check-label" for="task-comp"></label>
            <h3 class="task-title" title="${task.title || 'Без названия'}">${task.title || 'Без названия'}</h3>
            <span class="task-category" style="background-color: ${category.color}">
                ${category.name}
            </span>
            <button class="task-change">
                <img class="task-change-logo" src="img/edit-ico.svg" alt="Редактировать">
            </button>
        </div>
        <div class="task-date-wrapper">
            <button class="notification-btn ${notificationClass} ${isCompleted ? 'disabled' : ''}" title="Настроить уведомления">
                <img src="img/bell.svg" alt="Уведомления">
            </button>
            <span class="task-due-date">${formatDate(task.due_date)}</span>
            <button class="task-change-date">
                <img class="task-change-date-logo" src="img/edit-ico.svg" alt="Изменить дату">
            </button>
        </div>
        <div class="button-wrapper">
            <button class="task-open-description">
                <img class="task-description-ico" alt="Подробнее" src="img/arrow-desc.svg">
            </button>
            <button class="task-delete">
                <img class="task-delete-ico" src="img/delete-ico.svg" alt="Удалить">
            </button>
        </div>
    </div>
    <div class="task-description hidden">
        <h4 class="task-description-title">Описание</h4>
        <div class="description-content">
            <div class="task-description-text">${htmlDescription}</div>
            <div class="task-description-editor hidden" id="editor-${index}"></div>
        </div>
        <div class="editor-buttons hidden">
            <button class="save-description-btn">Сохранить</button>
            <button class="cancel-description-btn">Отмена</button>
        </div>
    </div>`;

    taskElement.setAttribute('style', `border-color: ${category.color}`);

    // Добавляем обработчик для кнопки уведомлений
    const notificationBtn = taskElement.querySelector('.notification-btn');
    notificationBtn.addEventListener('click', (e) => {
        if (!isCompleted) {  // Добавляем проверку
            e.stopPropagation();
            showNotificationDropdown(taskElement, task);
        }
    });

    return taskElement;
}

// Функция для отображения выпадающего меню уведомлений
function showNotificationDropdown(taskElement, task) {
    // Если задача выполнена, не показываем дропдаун
    if (task.status === 'completed') return;

    // Закрываем все открытые дропдауны
    document.querySelectorAll('.notification-dropdown').forEach(dropdown => dropdown.remove());

    const notificationBtn = taskElement.querySelector('.notification-btn');
    const taskDueDate = task.due_date ? new Date(task.due_date) : null;

    // Создаем дропдаун
    const dropdown = document.createElement('div');
    dropdown.className = 'notification-dropdown';

    // Получаем текущие настройки уведомления
    const currentNotification = task.notification_time ? new Date(task.notification_time) : null;
    const isEnabled = task.notifications_enabled || false;

    dropdown.innerHTML = `
        <h4>Настройка уведомления</h4>
        <div class="notification-form">
            <div class="notification-toggle">
                <label class="toggle-switch">
                    <input type="checkbox" id="notifications-enabled" ${isEnabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <span class="toggle-label">Уведомления ${isEnabled ? 'включены' : 'выключены'}</span>
            </div>
            <div class="notification-datetime ${!isEnabled ? 'disabled' : ''}">
                <input type="date" id="notification-date" 
                    ${taskDueDate ? `max="${taskDueDate.toISOString().split('T')[0]}"` : ''} 
                    value="${currentNotification ? currentNotification.toISOString().split('T')[0] : ''}"
                    ${!isEnabled ? 'disabled' : ''}
                >
                <input type="time" id="notification-time" 
                    value="${currentNotification ? currentNotification.toTimeString().slice(0,5) : ''}"
                    ${!isEnabled ? 'disabled' : ''}
                >
            </div>
            <div class="notification-error hidden"></div>
            <div class="notification-actions">
                <button class="save-notification">Сохранить</button>
            </div>
        </div>
    `;

    // Позиционируем дропдаун
    const rect = notificationBtn.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
    dropdown.style.left = `${rect.left + window.scrollX}px`;

    document.body.appendChild(dropdown);

    // Обработчики событий
    const toggleSwitch = dropdown.querySelector('#notifications-enabled');
    const dateInput = dropdown.querySelector('#notification-date');
    const timeInput = dropdown.querySelector('#notification-time');
    const errorDiv = dropdown.querySelector('.notification-error');
    const datetimeDiv = dropdown.querySelector('.notification-datetime');
    const toggleLabel = dropdown.querySelector('.toggle-label');

    // Обработчик переключателя
    toggleSwitch.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        toggleLabel.textContent = `Уведомления ${isEnabled ? 'включены' : 'выключены'}`;
        dateInput.disabled = !isEnabled;
        timeInput.disabled = !isEnabled;
        datetimeDiv.classList.toggle('disabled', !isEnabled);
    });

    // Валидация даты и времени
    function validateDateTime() {
        if (!toggleSwitch.checked) return true;

        const selectedDate = dateInput.value;
        const selectedTime = timeInput.value;
        const taskHasDate = task.due_date !== null;

        // Если у задачи нет даты, то обязательно нужно выбрать дату и время
        if (!taskHasDate && (!selectedDate || !selectedTime)) {
            errorDiv.textContent = 'Для задачи без даты необходимо указать дату и время уведомления';
            errorDiv.classList.remove('hidden');
            return false;
        }

        // Если выбрана дата и/или время, проверяем их
        if (selectedDate && selectedTime) {
            const selectedDateTime = new Date(`${selectedDate}T${selectedTime}`);
            const now = new Date();

            if (selectedDateTime < now) {
                errorDiv.textContent = 'Нельзя выбрать прошедшее время';
                errorDiv.classList.remove('hidden');
                return false;
            }

            if (taskHasDate) {
                const taskDueDate = new Date(task.due_date);
                if (selectedDateTime > taskDueDate) {
                    errorDiv.textContent = 'Время уведомления не может быть позже срока задачи';
                    errorDiv.classList.remove('hidden');
                    return false;
                }
            }
        }

        errorDiv.classList.add('hidden');
        return true;
    }

    // Убираем валидацию при изменении даты/времени
    dateInput.addEventListener('change', () => {
        errorDiv.classList.add('hidden');
    });
    timeInput.addEventListener('change', () => {
        errorDiv.classList.add('hidden');
    });

    // Закрытие time input при потере фокуса
    timeInput.addEventListener('blur', () => {
        // Даем браузеру время на обработку выбора
        setTimeout(() => {
            timeInput.type = 'text';
            timeInput.type = 'time';
        }, 200);
    });

    // Сохранение настроек
    dropdown.querySelector('.save-notification').addEventListener('click', async () => {
        if (!validateDateTime()) return;

        try {
            const updateData = {
                notifications_enabled: toggleSwitch.checked
            };

            if (toggleSwitch.checked) {
                if (dateInput.value && timeInput.value) {
                    // Если выбраны конкретные дата и время
                    const notificationTime = new Date(`${dateInput.value}T${timeInput.value}`);
                    updateData.notification_time = notificationTime.toISOString();
                } else if (task.due_date) {
                    // Если не выбраны дата и время, но у задачи есть дата - ставим 8:00
                    const taskDate = new Date(task.due_date);
                    taskDate.setHours(8, 0, 0, 0);
                    updateData.notification_time = taskDate.toISOString();
                } else {
                    // Если у задачи нет даты и не выбрано время - просто включаем уведомления без времени
                    updateData.notification_time = null;
                }
            } else {
                updateData.notification_time = null;
            }

            await todoAPI.updateTaskNotifications(task.task_id, updateData);
            
            // Обновляем состояние кнопки уведомлений
            notificationBtn.classList.toggle('has-notification', toggleSwitch.checked);
            task.notifications_enabled = toggleSwitch.checked;
            task.notification_time = updateData.notification_time;
            
            dropdown.remove();
        } catch (error) {
            console.error('Ошибка при сохранении настроек уведомления:', error);
            errorDiv.textContent = 'Ошибка при сохранении настроек';
            errorDiv.classList.remove('hidden');
        }
    });

    // Закрытие дропдауна при клике вне его
    document.addEventListener('click', function closeDropdown(e) {
        if (!dropdown.contains(e.target) && !notificationBtn.contains(e.target)) {
            dropdown.remove();
            document.removeEventListener('click', closeDropdown);
        }
    });
}

// Функция отображения настроек категорий
function showCategoryManager() {
    // Создаем модальное окно настроек
    const modal = document.createElement('div');
    modal.className = 'category-manager-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Управление категориями</h3>
            <button id="add-new-category-up" class="add-new-category">+</button>
            <ul class="categories-list"></ul>
            <div class="modal-buttons">
                <button id="add-new-category-down" class="add-new-category">Добавить категорию</button>
                <button id="close-category-manager">Закрыть</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    renderCategoriesList(modal.querySelector('.categories-list'));

    // Кнопкам добавления новой категории добавлем обработчики
    modal.querySelectorAll('.add-new-category').forEach(button => {
        button.addEventListener('click', addNewCategory)
    });

    // Добавляем обработчик для кнопки закрытия окна настроек
    modal.querySelector('#close-category-manager').addEventListener('click', () => modal.remove());

    // Если нажали на область вне осна настроек, то закрываем его
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// Функция для debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Функция для вывода списка категорий в настройках категорий
function renderCategoriesList(container) {
    container.innerHTML = '';

    Object.values(categories).forEach(category => {
        // Пропускаем категорию "Другое", так как она не редактируется
        if (category.id === defaultCategoryId) return;

        // Создаем элементы списка категорий
        const categoryElement = document.createElement('li');
        categoryElement.className = 'category-item';
        categoryElement.innerHTML = `
            <input type="color" class="category-color-picker" value="${category.color}">
            <input type="text" class="category-name" value="${category.name}" maxlength="15">
            <button class="delete-category" data-id="${category.id}">Удалить</button>
        `;

        container.appendChild(categoryElement);

        // Обработчик события для изменения имени категории
        const nameInput = categoryElement.querySelector('.category-name');
        nameInput.addEventListener('change', async (e) => {
            try {
                const newName = e.target.value.trim();
                if (newName.length === 0) {
                    e.target.value = category.name;
                    return;
                }
                
                await todoAPI.updateCategory(category.id, { 
                    name: newName,
                    color: category.color 
                });
                categories[category.id].name = newName;
                updateCategorySelectors();
                renderTasks();
            } catch (error) {
                console.error('Ошибка при обновлении имени категории:', error);
                e.target.value = category.name; // Возвращаем старое значение в случае ошибки
            }
        });

        // Создаем debounced функцию для обновления цвета
        const debouncedColorUpdate = debounce(async (newColor) => {
            try {
                const currentName = categories[category.id].name;
                await todoAPI.updateCategory(category.id, { 
                    name: currentName,
                    color: newColor 
                });
                categories[category.id].color = newColor;
                renderTasks();
            } catch (error) {
                console.error('Ошибка при обновлении цвета категории:', error);
            }
        }, 300); // Задержка в 300 миллисекунд

        // Обработчик события для изменения цвета категории
        const colorPicker = categoryElement.querySelector('.category-color-picker');
        let lastColor = category.color;

        // При изменении цвета только обновляем UI
        colorPicker.addEventListener('input', (e) => {
            const newColor = e.target.value;
            categoryElement.style.borderColor = newColor;
            const taskElements = document.querySelectorAll(`.task[data-category="${category.id}"]`);
            taskElements.forEach(task => {
                const categorySpan = task.querySelector('.task-category');
                if (categorySpan) {
                    categorySpan.style.backgroundColor = newColor;
                }
                task.style.borderColor = newColor;
            });
        });

        // При отпускании кнопки мыши сохраняем изменения в БД
        colorPicker.addEventListener('change', async (e) => {
            const newColor = e.target.value;
            if (newColor !== lastColor) {
                try {
                    const currentName = categories[category.id].name;
                    await todoAPI.updateCategory(category.id, { 
                        name: currentName,
                        color: newColor 
                    });
                    categories[category.id].color = newColor;
                    lastColor = newColor;
                    renderTasks();
                } catch (error) {
                    console.error('Ошибка при обновлении цвета категории:', error);
                    // В случае ошибки возвращаем предыдущий цвет
                    e.target.value = lastColor;
                    renderTasks();
                }
            }
        });

        // Обработчик события для удаления категории
        categoryElement.querySelector('.delete-category').addEventListener('click', async () => {
            await deleteCategory(category.id);
        });
    });
}

// Функция сохранения категорий
function saveCategories() {
    localStorage.setItem('todoCategories', JSON.stringify(categories));
}

// Функция обновления списка категорий в фильтрах
function updateCategorySelectors() {
    const categoryFilter = document.getElementById('category-filter');
    const options = Object.values(categories).map(cat =>
        `<option value="${cat.id}">${cat.name}</option>`
    ).join('');

    categoryFilter.innerHTML = `<option value="all">Все категории</option>${options}`;

    // Обновляем селекторы в формах
    const selects = document.querySelectorAll('.new-task-category, .task-category-select');
    selects.forEach(select => {
        if (select.parentNode) {
            select.innerHTML = Object.values(categories).map(cat =>
                `<option value="${cat.id}">${cat.name}</option>`
            ).join('');
        }
    });
}

// Функция добавления новой категории
async function addNewCategory() {
    const newId = generateId();
    const categoryNumber = Object.keys(categories).length;
    const colorPalette = [
        '#FF5252', '#FFD740', '#69F0AE', '#448AFF', '#B388FF',
        '#FF80AB', '#7C4DFF', '#64FFDA', '#FF8A80', '#EA80FC',
        '#8C9EFF', '#80D8FF', '#A7FFEB', '#CCFF90', '#FFFF8D'
    ];

    const randomColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    const defaultName = `Категория-${categoryNumber}`.slice(0, 15);

    try {
        const newCategory = await todoAPI.createCategory(defaultName, randomColor);
        
        categories[newCategory.category_id] = {
            id: newCategory.category_id,
            name: newCategory.name,
            color: newCategory.color
        };

        const manager = document.querySelector('.category-manager-modal');
        if (manager) {
            renderCategoriesList(manager.querySelector('.categories-list'));
        }
        
        updateCategorySelectors();
    } catch (error) {
        console.error('Ошибка при создании категории:', error);
    }
}

// Функция для создания уникального ID у категории
function generateId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 4);
    return `cat_${timestamp}_${randomPart}`;
}

// Функция удаления категории
async function deleteCategory(categoryId) {
    try {
        await todoAPI.deleteCategory(categoryId);
        delete categories[categoryId];
        
        // Загружаем актуальные данные с сервера
        await loadTasks();
        
        // Обновляем UI
        updateUI();
        
        // Обновляем список категорий в модальном окне
        const modal = document.querySelector('.category-manager-modal');
        if (modal) {
            const container = modal.querySelector('.categories-list');
            if (container) {
                renderCategoriesList(container);
            }
        }
    } catch (error) {
        console.error('Ошибка при удалении категории:', error);
    }
}

// Функция добавления новой задачи
async function addTask() {
    const newTask = document.createElement('li');
    newTask.className = "task new-task";

    const categoryOptions = Object.values(categories).map(cat =>
        `<option class="new-task-category-option" value="${cat.id}">${cat.name}</option>`
    ).join('');

    newTask.innerHTML = `
        <div class="task-title-wrapper">
            <img class="new-task-ico" src="img/checkbox-empty.svg" alt="check">
            <select class="new-task-category">
                ${categoryOptions}
            </select>
            <input class="new-task-title" type="text" name="new-task-title" maxlength="100">
        </div>
        <input type="date" class="new-task-due-date">
    `;

    const taskList = document.querySelector('#current-tasks-list');
    taskList.prepend(newTask);

    const newTitle = newTask.querySelector('.new-task-title');
    newTitle.focus();

    newTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            newTitle.blur();
        }
    });

    newTitle.addEventListener('blur', async (e) => {
        const selectCat = newTask.querySelector('.new-task-category');
        const dueDateInput = newTask.querySelector('.new-task-due-date');

        if (e.relatedTarget === selectCat || e.relatedTarget === dueDateInput) {
            newTitle.focus();
            return;
        }

        if (newTitle.value) {
            try {
                let dueDate = null;
                if (dueDateInput.value) {
                    // Создаем дату в локальном часовом поясе
                    const localDate = new Date(dueDateInput.value);
                    localDate.setHours(12, 0, 0, 0); // Устанавливаем время на полдень
                    dueDate = localDate.toISOString(); // Преобразуем в ISO формат
                }

                const taskData = {
                    title: newTitle.value,
                    description: '',
                    category_id: selectCat.value,
                    due_date: dueDate
                };

                await todoAPI.createTask(taskData);
                await loadTasks(); // Перезагружаем задачи с сервера
            } catch (error) {
                console.error('Ошибка при создании задачи:', error);
            }
        }
        newTask.remove();
    });
}

// Функция сохранения задач
function saveTasks() {
    localStorage.setItem('todoTasks', JSON.stringify(tasks));
    localStorage.setItem('todoCategories', JSON.stringify(categories));
}

// Функция редактирования задачи
async function changeTask(event) {
    const currentTaskWr = event.target.closest('.task');
    const currentTask = currentTaskWr.querySelector('.task-title-wrapper');
    const currentTaskTitle = currentTask.querySelector('.task-title');
    const currentTaskCategory = currentTask.querySelector('.task-category');

    const redactButton = currentTask.querySelector('.task-change');
    redactButton.classList.toggle('hidden');

    const isInput = currentTask.querySelector('.task-title-input');
    if (!isInput) {
        toggleTaskDraggable(currentTaskWr, false);

        const currentTitleText = currentTaskTitle.getAttribute('title') || currentTaskTitle.innerText;
        const currentCategoryId = currentTaskWr.dataset.category ||
            getCategoryIdByName(currentTaskCategory.textContent.trim()) ||
            defaultCategoryId;

        currentTaskTitle.remove();
        currentTaskCategory.remove();

        const categorySelect = document.createElement('select');
        categorySelect.className = 'task-category-select';

        Object.values(categories).forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            if (cat.id === currentCategoryId) option.selected = true;
            categorySelect.appendChild(option);
        });

        const taskTitleInput = document.createElement('input');
        taskTitleInput.setAttribute('type', 'text');
        taskTitleInput.setAttribute('value', currentTitleText);
        taskTitleInput.setAttribute('maxlength', 100);
        taskTitleInput.className = 'task-title-input';

        currentTask.insertBefore(categorySelect, redactButton);
        currentTask.insertBefore(taskTitleInput, categorySelect);

        // Устанавливаем фокус и перемещаем курсор в конец текста
        taskTitleInput.focus();
        taskTitleInput.selectionStart = taskTitleInput.value.length;
        taskTitleInput.selectionEnd = taskTitleInput.value.length;

        let isSaved = false;
        let newCategory = currentCategoryId;
        let newTitle = currentTitleText;

        const saveChanges = async () => {
            if (isSaved) return;
            isSaved = true;

            try {
                const taskElement = event.target.closest('.task');
                const taskId = taskElement.dataset.taskId;

                await todoAPI.updateTask(taskId, {
                    title: newTitle,
                    category_id: newCategory
                });

                await loadTasks(); // Перезагружаем задачи
                updateUI(); // Используем updateUI вместо renderTasks для сохранения фильтров
                toggleTaskDraggable(currentTaskWr, true);
            } catch (error) {
                console.error('Ошибка при обновлении задачи:', error);
            }
        };

        taskTitleInput.addEventListener('input', (e) => {
            newTitle = e.target.value;
        });

        categorySelect.addEventListener('change', (e) => {
            newCategory = e.target.value;
        });

        const handleBlur = (e) => {
            if (e.relatedTarget === categorySelect) {
                taskTitleInput.focus();
                return;
            }
            saveChanges();
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                saveChanges();
            }
        };

        taskTitleInput.addEventListener('blur', handleBlur);
        taskTitleInput.addEventListener('keydown', handleKeyDown);

        document.addEventListener('click', function outsideClick(e) {
            if (!currentTask.contains(e.target) && e.target !== redactButton) {
                saveChanges();
                document.removeEventListener('click', outsideClick);
            }
        }, { once: true });
    }
}

// Функция сортировки задач по дату
function sortTasksByDate(tasksArray) {
    const sortType = document.getElementById('date-sort').value;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Убираем время для сравнения

    if (sortType === 'none') {
        return tasksArray;
    }

    // Разделяем задачи на те, у которых есть дата и нет
    const tasksWithDate = tasksArray.filter(task => task.due_date);
    const tasksWithoutDate = tasksArray.filter(task => !task.due_date);

    // Сортируем только задачи с датой
    const sortedTasks = [...tasksWithDate].sort((a, b) => {
        const aDate = new Date(a.due_date);
        aDate.setHours(0, 0, 0, 0);
        const bDate = new Date(b.due_date);
        bDate.setHours(0, 0, 0, 0);

        // Для сортировки по близости к текущей дате
        if (sortType === 'nearest' || sortType === 'farthest') {
            const aDiff = Math.abs(aDate.getTime() - today.getTime());
            const bDiff = Math.abs(bDate.getTime() - today.getTime());

            return sortType === 'nearest' ? aDiff - bDiff : bDiff - aDiff;
        }
        // Для простой сортировки по дате
        else {
            return sortType === 'asc' ? aDate.getTime() - bDate.getTime() : bDate.getTime() - aDate.getTime();
        }
    });

    // Возвращаем отсортированные задачи с датой + задачи без даты
    return sortType === 'asc' ? [...sortedTasks, ...tasksWithoutDate] : [...sortedTasks, ...tasksWithoutDate];
}

// Вспомогательная функция для поиска ID категории по имени
function getCategoryIdByName(name) {
    for (const [id, category] of Object.entries(categories)) {
        if (category.name === name) return id;
    }
    return null;
}

// Функция инициализации редактора описания
function initEditorForTask(taskElement) {
    if (!taskElement) return;

    // Отключаем перетаскивание при редактировании описания
    toggleTaskDraggable(taskElement, false);

    const index = taskElement.dataset.originalIndex;
    const isCompleted = taskElement.classList.contains('completed-task');
    const task = isCompleted ? tasks.completed[index] : tasks.active[index];

    if (!task) return;

    const editorId = `editor-${index}`;
    const editorContainer = taskElement.querySelector(`#${editorId}`);
    const textDescription = taskElement.querySelector('.task-description-text');
    const editorButtons = taskElement.querySelector('.editor-buttons');

    if (!editorContainer || !textDescription || !editorButtons) return;

    if (activeEditors[editorId]) {
        editorContainer.classList.remove('hidden');
        editorButtons.classList.remove('hidden');
        textDescription.classList.add('hidden');
        return;
    }

    textDescription.classList.add('hidden');
    editorContainer.classList.remove('hidden');
    editorButtons.classList.remove('hidden');

    try {
        const editor = new toastui.Editor({
            el: editorContainer,
            initialValue: task.description || '',
            previewStyle: 'tab',
            height: 'auto',
            minHeight: '100px',
            initialEditType: 'wysiwyg',
            hideModeSwitch: true,
            toolbarItems: [
                ['heading', 'bold', 'italic', 'strike'],
                ['hr', 'quote'],
                ['ul', 'ol', 'task'],
                ['link'],
            ]
        });

        activeEditors[editorId] = editor;
    } catch (e) {
        console.error('Ошибка при инициализации редактора:', e);
        textDescription.classList.remove('hidden');
        editorContainer.classList.add('hidden');
        editorButtons.classList.add('hidden');
        // Включаем перетаскивание обратно при ошибке
        toggleTaskDraggable(taskElement, true);
    }
}

// Функция сохранения описания
async function saveTaskDescription(event) {
    const taskElement = event.target.closest('.task');
    if (!taskElement) return;

    const index = parseInt(taskElement.dataset.originalIndex);
    if (isNaN(index)) return;

    const editorId = `editor-${index}`;
    const editor = activeEditors[editorId];

    if (!editor) return;

    const editorContainer = taskElement.querySelector(`#${editorId}`);
    const textDescription = taskElement.querySelector('.task-description-text');
    const editorButtons = taskElement.querySelector('.editor-buttons');
    const descriptionBlock = taskElement.querySelector('.task-description');

    if (!editorContainer || !textDescription || !editorButtons) return;

    try {
        const markdownContent = editor.getMarkdown();
        const htmlContent = editor.getHTML();
        const taskId = taskElement.dataset.taskId;

        // Сохраняем описание в БД
        await todoAPI.updateTask(taskId, {
            description: markdownContent
        });

        // Обновляем отображение
        textDescription.innerHTML = htmlContent || 'Нет описания';
        textDescription.classList.remove('hidden');
        editorContainer.classList.add('hidden');
        editorButtons.classList.add('hidden');
        descriptionBlock.classList.remove('hidden'); // Убеждаемся, что блок описания остается видимым

        // Включаем перетаскивание обратно после сохранения
        toggleTaskDraggable(taskElement, true);

        destroyEditor(editorId);
        
        // Перезагружаем задачи для обновления данных
        await loadTasks();

        // После перезагрузки задач находим обновленный элемент и открываем его описание
        const updatedTaskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (updatedTaskElement) {
            const updatedDescBlock = updatedTaskElement.querySelector('.task-description');
            if (updatedDescBlock) {
                updatedDescBlock.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error('Ошибка при сохранении описания:', error);
    }
}

// Функция отмены редактирования описания
function cancelTaskDescriptionEditing(event) {
    const taskElement = event.target.closest('.task');
    if (!taskElement) return;

    const index = parseInt(taskElement.dataset.originalIndex);
    if (isNaN(index)) return;

    const editorId = `editor-${index}`;
    const editorContainer = taskElement.querySelector(`#${editorId}`);
    const textDescription = taskElement.querySelector('.task-description-text');
    const editorButtons = taskElement.querySelector('.editor-buttons');

    if (!editorContainer || !textDescription || !editorButtons) return;

    textDescription.classList.remove('hidden');
    editorContainer.classList.add('hidden');
    editorButtons.classList.add('hidden');

    // Включаем перетаскивание обратно при отмене
    toggleTaskDraggable(taskElement, true);

    destroyEditor(editorId);
}

// Функция, которая убирает текстовый редактор описания
function destroyEditor(editorId) {
    if (!editorId || !activeEditors[editorId]) return;

    try {
        activeEditors[editorId].destroy();
        delete activeEditors[editorId];
    } catch (e) {
        console.error('Ошибка при уничтожении редактора:', e);
    }
}

// Функция изменения даты у задачи
async function changeTaskDate(event) {
    const taskElement = event.target.closest('.task');
    if (!taskElement) return;

    // Отключаем перетаскивание при редактировании даты
    toggleTaskDraggable(taskElement, false);

    const dateWrapper = taskElement.querySelector('.task-date-wrapper');
    if (!dateWrapper) return;

    const currentDateSpan = dateWrapper.querySelector('.task-due-date');
    const changeDateBtn = dateWrapper.querySelector('.task-change-date');
    if (!currentDateSpan || !changeDateBtn) return;

    const originalDate = currentDateSpan.textContent;

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'task-date-input';

    if (originalDate !== 'Без срока') {
        const [day, month, year] = originalDate.split('.');
        dateInput.value = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    currentDateSpan.replaceWith(dateInput);
    changeDateBtn.classList.add('hidden');

    dateInput.focus();

    const saveDate = async () => {
        try {
            const taskId = taskElement.dataset.taskId;
            let newDate = null;

            if (dateInput.value) {
                const localDate = new Date(dateInput.value);
                localDate.setHours(12, 0, 0, 0);
                newDate = localDate.toISOString();
            }

            const task = await todoAPI.findTask(taskId);

            if (task.notifications_enabled && task.notification_time) {
                const notificationDate = new Date(task.notification_time);
                const oldTaskDate = new Date(task.due_date);
                
                if (notificationDate.getHours() === 8 && 
                    notificationDate.getMinutes() === 0 &&
                    notificationDate.getDate() === oldTaskDate.getDate() &&
                    notificationDate.getMonth() === oldTaskDate.getMonth() &&
                    notificationDate.getFullYear() === oldTaskDate.getFullYear()) {
                    
                    if (newDate) {
                        const newNotificationDate = new Date(newDate);
                        newNotificationDate.setHours(8, 0, 0, 0);
                        await todoAPI.updateTaskNotifications(taskId, {
                            notifications_enabled: true,
                            notification_time: newNotificationDate.toISOString()
                        });
                    } else {
                        await todoAPI.updateTaskNotifications(taskId, {
                            notifications_enabled: false,
                            notification_time: null
                        });
                    }
                }
            }

            await todoAPI.updateTask(taskId, { due_date: newDate });
            await loadTasks(); // Перезагружаем задачи
            updateUI(); // Используем updateUI вместо renderTasks для сохранения фильтров

            toggleTaskDraggable(taskElement, true);
            document.removeEventListener('click', handleOutsideClick);
        } catch (error) {
            console.error('Ошибка при обновлении даты:', error);
            // Возвращаем оригинальную дату в случае ошибки
            const newSpan = document.createElement('span');
            newSpan.className = 'task-due-date';
            newSpan.textContent = originalDate;
            dateInput.replaceWith(newSpan);
            changeDateBtn.classList.remove('hidden');
        }
    };

    const cancelDateEdit = () => {
        const newSpan = document.createElement('span');
        newSpan.className = 'task-due-date';
        newSpan.textContent = originalDate;

        dateInput.replaceWith(newSpan);
        changeDateBtn.classList.remove('hidden');

        // Включаем перетаскивание обратно при отмене
        toggleTaskDraggable(taskElement, true);

        document.removeEventListener('click', handleOutsideClick);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            saveDate();
        } else if (e.key === 'Escape') {
            cancelDateEdit();
        }
    };

    const handleOutsideClick = (e) => {
        if (!dateWrapper.contains(e.target) && e.target !== changeDateBtn) {
            saveDate();
        }
    };

    dateInput.addEventListener('blur', saveDate);
    dateInput.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleOutsideClick);
}

// Функция для форматирование даты для отображения
function formatDate(dateString) {
    if (!dateString) return 'Без срока';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Функция удаления задачи
async function deleteTask(event) {
    try {
        const taskElement = event.target.closest('.task');
        const taskId = taskElement.dataset.taskId;

        await todoAPI.deleteTask(taskId);
        await loadTasks(); // Перезагружаем задачи
    } catch (error) {
        console.error('Ошибка при удалении задачи:', error);
    }
}

// Функция отметки задачи как выполненной/невыполненной
async function completeTask(event) {
    const taskElement = event.target.closest('.task');
    if (!taskElement) return;

    try {
        const taskId = taskElement.dataset.taskId;
        const isCompleted = taskElement.dataset.isCompleted === 'true';

        if (!isCompleted) {
            // Если задача отмечается как выполненная, отключаем уведомления
            await todoAPI.updateTaskNotifications(taskId, {
                notifications_enabled: false,
                notification_time: null
            });
            await todoAPI.completeTask(taskId);
        } else {
            await todoAPI.uncompleteTask(taskId);
        }

        await loadTasks(); // Перезагружаем задачи
        updateUI(); // Используем updateUI вместо renderTasks для сохранения фильтров
    } catch (error) {
        console.error('Ошибка при изменении статуса задачи:', error);
    }
}

// Функция инициализации диаграммы
function initPieChart() {
    const ctx = document.getElementById('pieChart').getContext('2d');

    // Если диаграмма уже существует, уничтожаем ее
    if (pieChart) {
        pieChart.destroy();
    }

    // Получаем данные для выбранного типа диаграммы
    const { labels, data, backgroundColors } = getChartData(currentChartType);

    // Создает новую диаграмму
    pieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    updateChartLegend(labels, backgroundColors, data);
}

// Функция для получения данных в зависимости от типа диаграммы
function getChartData(type) {
    switch (type) {
        case CHART_TYPES.COMPLETION:
            return {
                labels: ['Завершённые', 'Активные'],
                data: [tasks.completed.length, tasks.active.length],
                backgroundColors: ['#4CAF50', '#9E9E9E']
            };

        case CHART_TYPES.COMPLETED_BY_CATEGORY:
            return getDataByCategory(true);

        case CHART_TYPES.ACTIVE_BY_CATEGORY:
            return getDataByCategory(false);

        default:
            return getChartData(CHART_TYPES.COMPLETION);
    }
}

// Функция для получения данных по категориям
function getDataByCategory(completed) {
    const taskList = completed ? tasks.completed : tasks.active;
    const categoryCounts = {};

    // Считаем задачи по категориям
    taskList.forEach(task => {
        const categoryId = task.category_id || defaultCategoryId;
        categoryCounts[categoryId] = (categoryCounts[categoryId] || 0) + 1;
    });

    // Формируем данные для диаграммы
    const labels = [];
    const data = [];
    const backgroundColors = [];

    Object.keys(categories).forEach(categoryId => {
        if (categoryCounts[categoryId]) {
            labels.push(categories[categoryId].name);
            data.push(categoryCounts[categoryId]);
            backgroundColors.push(categories[categoryId].color);
        }
    });

    return { labels, data, backgroundColors };
}

// Функция для обновления легенды
function updateChartLegend(labels, colors, data) {
    const legendContainer = document.getElementById('chart-legend');
    legendContainer.innerHTML = '';

    let total = 0;

    labels.forEach((label, index) => {
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';

        legendItem.innerHTML = `
            <span class="legend-color" style="background-color: ${colors[index]}"></span>
            <span class="legend-text">${label}: ${data[index]}</span>
        `;

        legendContainer.appendChild(legendItem);
        total += data[index];
    });

    // Добавляем итоговую строку
    const totalItem = document.createElement('div');
    totalItem.className = 'legend-item total';
    totalItem.innerHTML = `<span class="legend-text">Всего: ${total}</span>`;
    legendContainer.appendChild(totalItem);
}

// Функция обновления статистики на вкладке "статистика"
function updateStats() {
    // Проверяем, существует ли диаграмма и активна ли вкладка статистики
    const statsTabActive = document.getElementById('statistics').classList.contains('active');

    // Обновляем счетчики только если они видны
    if (statsTabActive) {
        const completedCount = tasks.completed.length;
        const activeCount = tasks.active.length;
        const totalCount = completedCount + activeCount;

        // Проверяем существование элементов перед обновлением
        const completedElement = document.getElementById('completed-count');
        const activeElement = document.getElementById('active-count');
        const totalElement = document.getElementById('total-count');

        if (completedElement) completedElement.textContent = completedCount;
        if (activeElement) activeElement.textContent = activeCount;
        if (totalElement) totalElement.textContent = totalCount;

        // Если диаграмма активна - обновляем ее
        if (pieChart) {
            const { labels, data, backgroundColors } = getChartData(currentChartType);

            pieChart.data.labels = labels;
            pieChart.data.datasets[0].data = data;
            pieChart.data.datasets[0].backgroundColor = backgroundColors;
            pieChart.update();

            updateChartLegend(labels, backgroundColors, data);
        }
    }

    if (document.getElementById('statistics').classList.contains('active')) {
        updateProductivityChart();
    }
}

// Функция для получения данных продуктивности
async function getProductivityData() {
    const periodSelect = document.getElementById('productivity-period');
    const period = periodSelect.value;

    let startDate, endDate = new Date();
    endDate.setHours(23, 59, 59, 999); // Конец дня

    if (period === PRODUCTIVITY_PERIODS.CUSTOM) {
        const startDateStr = document.getElementById('productivity-start-date').value;
        const endDateStr = document.getElementById('productivity-end-date').value;

        if (!startDateStr || !endDateStr) {
            // Если даты не выбраны, используем последние 7 дней по умолчанию
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
        } else {
            startDate = new Date(startDateStr);
            endDate = new Date(endDateStr);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
        }
    } else {
        const days = parseInt(period);
        startDate = new Date();
        startDate.setDate(startDate.getDate() - days + 1);
        startDate.setHours(0, 0, 0, 0);
    }

    try {
        // Получаем данные с сервера
        const productivityData = await todoAPI.getProductivityData({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        });

        // Создаем массив дат для отображения
        const dateArray = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            dateArray.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Подготавливаем данные для графика
        const labels = dateArray.map(date => formatDateForChart(date));
        const data = dateArray.map(date => {
            const dateStr = date.toISOString().split('T')[0];
            const dayData = productivityData.find(item => {
                const itemDate = new Date(item.date);
                return itemDate.toISOString().split('T')[0] === dateStr;
            });
            return dayData ? dayData.completed_count : 0;
        });

        return { labels, data };
    } catch (error) {
        console.error('Ошибка при получении данных продуктивности:', error);
        return { labels: [], data: [] };
    }
}

// Форматирование даты для графика
function formatDateForChart(date) {
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short'
    });
}

// Функция для инициализации графика продуктивности
async function initProductivityChart() {
    const ctx = document.getElementById('productivityChart').getContext('2d');

    // Если график уже есть, то уничтожаем его
    if (productivityChart) {
        productivityChart.destroy();
    }

    // Получаем данные для графика
    const { labels, data } = await getProductivityData();

    productivityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Выполнено задач',
                data: data,
                backgroundColor: '#4CAF50',
                borderColor: '#388E3C',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    title: {
                        display: true,
                        text: 'Количество задач'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Дата'
                    }
                }
            }
        }
    });
}

// Обновление графика продуктивности
async function updateProductivityChart() {
    if (document.getElementById('statistics').classList.contains('active')) {
        await initProductivityChart();
    }
}

// Функция для инициализации модального окна экспорта
function initExportModal() {
    const modal = document.createElement('div');
    modal.className = 'export-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Экспорт задач в PDF</h3>
            
            <div class="export-options">
                <label>Тип экспорта:</label>
                <select id="export-type">
                    <option value="${EXPORT_TYPES.SELECTED}">Только выбранные задачи</option>
                    <option value="${EXPORT_TYPES.ALL_TASKS}">Все задачи</option>
                    <option value="${EXPORT_TYPES.ALL_COMPLETED}">Все выполненные</option>
                    <option value="${EXPORT_TYPES.ALL_ACTIVE}">Все невыполненные</option>
                    <option value="${EXPORT_TYPES.BY_DATE_RANGE}">Задачи за период</option>
                </select>
                
                <div id="date-range-options" class="hidden">
                    <label>Период:</label>
                    <input type="date" id="export-start-date">
                    <span>по</span>
                    <input type="date" id="export-end-date">
                </div>
                
                <div id="selected-tasks-container">
                    <label>Выберите задачи для экспорта:</label>
                    <div id="selected-tasks-list" class="export-tasks-list"></div>
                </div>
                
                <div class="export-chart-options">
                    <label>Добавить диаграмму:</label>
                    <select id="export-chart-type">
                        <option value="${EXPORT_CHART_TYPES.NONE}">Нет</option>
                        <option value="${EXPORT_CHART_TYPES.COMPLETION}">Выполненные/Невыполненные</option>
                        <option value="${EXPORT_CHART_TYPES.BY_CATEGORY}">По категориям</option>
                    </select>
                </div>
                
                <div class="export-productivity-options">
                    <label>Добавить график продуктивности:</label>
                    <select id="export-productivity-type">
                        <option value="${EXPORT_PRODUCTIVITY_TYPES.NONE}">Нет</option>
                        <option value="${EXPORT_PRODUCTIVITY_TYPES.LAST_7_DAYS}">Последние 7 дней</option>
                        <option value="${EXPORT_PRODUCTIVITY_TYPES.LAST_14_DAYS}">Последние 14 дней</option>
                        <option value="${EXPORT_PRODUCTIVITY_TYPES.LAST_30_DAYS}">Последние 30 дней</option>
                        <option value="${EXPORT_PRODUCTIVITY_TYPES.CUSTOM}">Выбрать период</option>
                    </select>
                    
                    <div id="export-productivity-custom" class="hidden">
                        <label>Период:</label>
                        <input type="date" id="export-productivity-start-date">
                        <span>по</span>
                        <input type="date" id="export-productivity-end-date">
                    </div>
                </div>
            </div>
            
            <div class="modal-buttons">
                <button id="generate-pdf-btn">Сгенерировать PDF</button>
                <button id="close-export-modal">Закрыть</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Сразу рендерим список задач для выбора
    renderTasksForExportSelection();

    // Добавляем обработчики событий для модального окна
    document.getElementById('export-type').addEventListener('change', (e) => {
        const type = e.target.value;
        document.getElementById('date-range-options').classList.toggle('hidden', type !== EXPORT_TYPES.BY_DATE_RANGE);
        document.getElementById('selected-tasks-container').classList.toggle('hidden', type !== EXPORT_TYPES.SELECTED);

        if (type === EXPORT_TYPES.SELECTED) {
            renderTasksForExportSelection();
        }
    });

    // Обработчик для выбора "типа" рафика продуктивности
    document.getElementById('export-productivity-type').addEventListener('change', (e) => {
        const type = e.target.value;
        document.getElementById('export-productivity-custom').classList.toggle('hidden', type !== EXPORT_PRODUCTIVITY_TYPES.CUSTOM);
    });

    // Обработчик для кнопки создания пдф, с ожидаением генерации файла
    document.getElementById('generate-pdf-btn').addEventListener('click', async () => {
        try {
            await generatePdf();
        } catch (error) {
            console.error('Ошибка при генерации PDF:', error);
            alert('Произошла ошибка при генерации PDF. Пожалуйста, попробуйте еще раз.');
        }
    });

    // Обработчики для закрытия окна
    document.getElementById('close-export-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// Функция для отображения задач для выбора при экспорте
function renderTasksForExportSelection() {
    const container = document.getElementById('selected-tasks-list');
    if (!container) return;

    container.innerHTML = '';

    // Добавляем активные задачи
    tasks.active.forEach((task, index) => {
        const taskElement = document.createElement('div');
        taskElement.className = 'export-task-item';
        taskElement.innerHTML = `
            <input type="checkbox" id="task-${index}-active" class="export-task-checkbox" data-index="${index}" data-type="active">
            <label for="task-${index}-active" title="${task.title || 'Без названия'}">${task.title || 'Без названия'} (Активная)</label>
        `;
        container.appendChild(taskElement);
    });

    // Добавляем выполненные задачи
    tasks.completed.forEach((task, index) => {
        const taskElement = document.createElement('div');
        taskElement.className = 'export-task-item';
        taskElement.innerHTML = `
            <input type="checkbox" id="task-${index}-completed" class="export-task-checkbox" data-index="${index}" data-type="completed">
            <label for="task-${index}-completed" title="${task.title || 'Без названия'}">${task.title || 'Без названия'} (Выполненная)</label>
        `;
        container.appendChild(taskElement);
    });

    // Если нет задач, показываем сообщение
    if (tasks.active.length === 0 && tasks.completed.length === 0) {
        container.innerHTML = '<div class="no-tasks-message">Нет задач для выбора</div>';
    }
}

// Функция для получения задач в зависимости от выбранного типа экспорта
function getTasksForExport() {
    const exportType = document.getElementById('export-type').value;

    switch (exportType) {
        case EXPORT_TYPES.SELECTED:
            return getSelectedTasks();
        case EXPORT_TYPES.ALL_COMPLETED:
            return { active: [], completed: [...tasks.completed] };
        case EXPORT_TYPES.ALL_ACTIVE:
            return { active: [...tasks.active], completed: [] };
        case EXPORT_TYPES.ALL_TASKS:
            return { active: [...tasks.active], completed: [...tasks.completed] };
        case EXPORT_TYPES.BY_DATE_RANGE:
            return getTasksByDateRange();
        default:
            return { active: [], completed: [] };
    }
}

// Функция для получения выбранных задач
function getSelectedTasks() {
    const checkboxes = document.querySelectorAll('.export-task-checkbox:checked');
    const selectedTasks = { active: [], completed: [] };

    checkboxes.forEach(checkbox => {
        const index = parseInt(checkbox.dataset.index);
        const type = checkbox.dataset.type;

        if (type === 'active' && tasks.active[index]) {
            selectedTasks.active.push(tasks.active[index]);
        } else if (type === 'completed' && tasks.completed[index]) {
            selectedTasks.completed.push(tasks.completed[index]);
        }
    });

    return selectedTasks;
}

// Функция для получения задач за определенный период
function getTasksByDateRange() {
    const startDateStr = document.getElementById('export-start-date').value;
    const endDateStr = document.getElementById('export-end-date').value;

    if (!startDateStr || !endDateStr) {
        return { active: [], completed: [] };
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const filteredTasks = { active: [], completed: [] };

    // Фильтруем активные задачи
    filteredTasks.active = tasks.active.filter(task => {
        if (!task.dueDate) return false;
        const taskDate = new Date(task.dueDate);
        return taskDate >= startDate && taskDate <= endDate;
    });

    // Фильтруем выполненные задачи
    filteredTasks.completed = tasks.completed.filter(task => {
        if (!task.lastStatusChange) return false;
        const taskDate = new Date(task.lastStatusChange);
        return taskDate >= startDate && taskDate <= endDate;
    });

    return filteredTasks;
}

// Функция генерации PDF
async function generatePdf() {
    // Получаем задачи для экспорта
    const exportTasks = getTasksForExport();

    // Создаем документ
    const docDefinition = {
        content: [],
        styles: {
            header: {
                fontSize: 18,
                bold: true,
                margin: [0, 0, 0, 10]
            },
            subheader: {
                fontSize: 14,
                bold: true,
                margin: [0, 10, 0, 5]
            },
            taskTitle: {
                fontSize: 12,
                bold: true,
                margin: [0, 5, 0, 2]
            },
            taskDescription: {
                fontSize: 10,
                margin: [10, 0, 0, 5],
                color: '#555'
            },
            taskDate: {
                fontSize: 10,
                margin: [0, 0, 0, 5],
                color: '#777'
            },
            categoryLabel: {
                fontSize: 10,
                margin: [0, 0, 0, 5],
                color: '#444'
            }
        },
        defaultStyle: {
            font: 'Roboto'
        }
    };

    // Добавляем заголовок
    docDefinition.content.push({
        text: 'Список задач',
        style: 'header'
    });

    // Добавляем дату генерации
    docDefinition.content.push({
        text: `Сгенерировано: ${new Date().toLocaleString('ru-RU')}`,
        fontSize: 10,
        color: '#999',
        margin: [0, 0, 0, 20]
    });

    // Добавляем активные задачи
    if (exportTasks.active.length > 0) {
        docDefinition.content.push({
            text: 'Активные задачи',
            style: 'subheader'
        });

        exportTasks.active.forEach(task => {
            addTaskToPdf(docDefinition, task, false);
        });
    }

    // Добавляем выполненные задачи
    if (exportTasks.completed.length > 0) {
        docDefinition.content.push({
            text: 'Выполненные задачи',
            style: 'subheader'
        });

        exportTasks.completed.forEach(task => {
            addTaskToPdf(docDefinition, task, true);
        });
    }

    // Добавляем статистику
    docDefinition.content.push({
        text: 'Статистика',
        style: 'subheader',
        pageBreak: 'before'
    });

    const totalTasks = exportTasks.active.length + exportTasks.completed.length;
    docDefinition.content.push({
        text: `Всего задач: ${totalTasks}`,
        margin: [0, 0, 0, 5]
    });

    docDefinition.content.push({
        text: `Активных: ${exportTasks.active.length}`,
        margin: [0, 0, 0, 5]
    });

    docDefinition.content.push({
        text: `Выполненных: ${exportTasks.completed.length}`,
        margin: [0, 0, 0, 20]
    });

    // Добавляем диаграмму, если выбрано
    const chartType = document.getElementById('export-chart-type').value;
    if (chartType !== EXPORT_CHART_TYPES.NONE && totalTasks > 0) {
        await addChartToPdf(docDefinition, exportTasks, chartType);
    }

    // Добавляем график продуктивности, если выбрано
    const productivityType = document.getElementById('export-productivity-type').value;
    if (productivityType !== EXPORT_PRODUCTIVITY_TYPES.NONE) {
        await addProductivityChartToPdf(docDefinition, productivityType);
    }

    // Генерируем PDF
    pdfMake.createPdf(docDefinition).download('tasks_export.pdf');

    // Закрываем модальное окно
    document.querySelector('.export-modal')?.remove();
}

// Функция для добавления задачи в PDF
function addTaskToPdf(docDefinition, task, isCompleted) {
    const category = categories[task.category_id] || categories[defaultCategoryId];

    docDefinition.content.push({
        text: task.title || 'Без названия',  // В PDF показываем полный заголовок
        style: 'taskTitle'
    });

    docDefinition.content.push({
        text: `Категория: ${category.name}`,
        style: 'categoryLabel',
        color: category.color
    });

    if (task.dueDate) {
        docDefinition.content.push({
            text: `Срок: ${formatDate(task.dueDate)}`,
            style: 'taskDate'
        });
    }

    if (task.description) {
        docDefinition.content.push({
            text: task.description,
            style: 'taskDescription'
        });
    }

    docDefinition.content.push({
        text: `Статус: ${isCompleted ? 'Выполнена' : 'Активна'}`,
        style: 'taskDate',
        margin: [0, 0, 0, 10]
    });

    docDefinition.content.push({
        canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: '#eee' }],
        margin: [0, 5, 0, 5]
    });
}

// Функция для добавления диаграммы в PDF
async function addChartToPdf(docDefinition, exportTasks, chartType) {
    // Создаем данные для диаграммы
    let chartData;
    let chartTitle;

    if (chartType === EXPORT_CHART_TYPES.COMPLETION) {
        chartTitle = 'Соотношение выполненных и активных задач';
        chartData = {
            labels: ['Выполненные', 'Активные'],
            datasets: [
                {
                    data: [exportTasks.completed.length, exportTasks.active.length],
                    backgroundColor: ['#4CAF50', '#FF9800']
                }
            ]
        };
    } else if (chartType === EXPORT_CHART_TYPES.BY_CATEGORY) {
        chartTitle = 'Распределение задач по категориям';

        // Собираем данные по категориям
        const categoryCounts = {};
        const categoryColors = {};

        // Обрабатываем активные задачи
        exportTasks.active.forEach(task => {
            const categoryId = task.category || defaultCategoryId;
            categoryCounts[categoryId] = (categoryCounts[categoryId] || 0) + 1;
            if (!categoryColors[categoryId]) {
                categoryColors[categoryId] = categories[categoryId]?.color || '#607D8B';
            }
        });

        // Обрабатываем выполненные задачи
        exportTasks.completed.forEach(task => {
            const categoryId = task.category || defaultCategoryId;
            categoryCounts[categoryId] = (categoryCounts[categoryId] || 0) + 1;
            if (!categoryColors[categoryId]) {
                categoryColors[categoryId] = categories[categoryId]?.color || '#607D8B';
            }
        });

        // Формируем данные для диаграммы
        const labels = [];
        const data = [];
        const backgroundColors = [];

        Object.keys(categoryCounts).forEach(categoryId => {
            const category = categories[categoryId] || categories[defaultCategoryId];
            labels.push(category.name);
            data.push(categoryCounts[categoryId]);
            backgroundColors.push(categoryColors[categoryId]);
        });

        chartData = {
            labels: labels,
            datasets: [
                {
                    data: data,
                    backgroundColor: backgroundColors
                }
            ]
        };
    }

    // Добавляем заголовок диаграммы
    docDefinition.content.push({
        text: chartTitle,
        style: 'subheader',
        margin: [0, 20, 0, 10]
    });

    try {
        // Получаем изображение диаграммы
        const chartImage = await getChartImage(chartData);

        // Добавляем саму диаграмму
        docDefinition.content.push({
            image: chartImage,
            width: 400,
            alignment: 'center',
            margin: [0, 0, 0, 20]
        });

        // Добавляем легенду
        const legendItems = [];
        chartData.labels.forEach((label, index) => {
            legendItems.push({
                text: `${label}: ${chartData.datasets[0].data[index]}`,
                margin: [0, 0, 0, 5]
            });
        });

        docDefinition.content.push({
            stack: legendItems,
            margin: [50, 0, 0, 20]
        });
    } catch (error) {
        console.error('Ошибка при создании диаграммы:', error);
        docDefinition.content.push({
            text: 'Не удалось создать диаграмму',
            color: 'red',
            margin: [0, 0, 0, 20]
        });
    }
}

// Функция для добавления графика продуктивности в PDF
async function addProductivityChartToPdf(docDefinition, productivityType) {
    let startDate, endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (productivityType === EXPORT_PRODUCTIVITY_TYPES.CUSTOM) {
        const startDateStr = document.getElementById('export-productivity-start-date').value;
        const endDateStr = document.getElementById('export-productivity-end-date').value;

        if (!startDateStr || !endDateStr) {
            // Если даты не выбраны, используем последние 7 дней по умолчанию
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
        } else {
            startDate = new Date(startDateStr);
            endDate = new Date(endDateStr);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
        }
    } else {
        const days = parseInt(productivityType);
        startDate = new Date();
        startDate.setDate(startDate.getDate() - days + 1);
        startDate.setHours(0, 0, 0, 0);
    }

    try {
        // Получаем данные с сервера
        const productivityData = await todoAPI.getProductivityData({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        });

        // Создаем массив дат для отображения
        const dateArray = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            dateArray.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Подготавливаем данные для графика
        const labels = dateArray.map(date => formatDateForChart(date));
        const data = dateArray.map(date => {
            const dateStr = date.toISOString().split('T')[0];
            const dayData = productivityData.find(item => {
                const itemDate = new Date(item.date);
                return itemDate.toISOString().split('T')[0] === dateStr;
            });
            return dayData ? dayData.completed_count : 0;
        });

        // Добавляем заголовок графика
        docDefinition.content.push({
            text: 'График продуктивности',
            style: 'subheader',
            margin: [0, 20, 0, 10]
        });

        // Добавляем описание периода
        docDefinition.content.push({
            text: `Период: с ${formatDate(startDate)} по ${formatDate(endDate)}`,
            margin: [0, 0, 0, 10]
        });

        // Создаем данные для графика
        const chartData = {
            labels: labels,
            datasets: [{
                label: 'Выполнено задач',
                data: data,
                backgroundColor: '#4CAF50',
                borderColor: '#388E3C',
                borderWidth: 1
            }]
        };

        // Создаем временный canvas для графика
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');

        // Создаем график
        new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                responsive: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            font: {
                                size: 12
                            }
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size: 12
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                animation: false
            }
        });

        // Получаем изображение графика
        const chartImage = canvas.toDataURL('image/png');

        // Добавляем график в PDF
        docDefinition.content.push({
            image: chartImage,
            width: 500,
            alignment: 'center',
            margin: [0, 0, 0, 20]
        });

        // Добавляем статистику
        const totalCompleted = data.reduce((sum, count) => sum + count, 0);
        const avgCompleted = totalCompleted / data.length;

        docDefinition.content.push({
            text: [
                `Всего выполнено задач за период: ${totalCompleted}\n`,
                `Среднее количество выполненных задач в день: ${avgCompleted.toFixed(1)}`
            ],
            margin: [0, 0, 0, 20]
        });

    } catch (error) {
        console.error('Ошибка при создании графика продуктивности:', error);
        docDefinition.content.push({
            text: 'Не удалось создать график продуктивности',
            color: 'red',
            margin: [0, 0, 0, 20]
        });
    }
}

// Функция для создания изображения круговой диаграммы
function getChartImage(chartData) {
    return new Promise((resolve) => {
        // Создаем временный canvas
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');

        // Создаем диаграмму
        new Chart(ctx, {
            type: 'pie',
            data: chartData,
            options: {
                responsive: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                animation: {
                    onComplete: () => {
                        // После завершения анимации получаем данные изображения
                        const image = canvas.toDataURL('image/png');
                        resolve(image);
                    }
                }
            }
        });
    });
}

// Функция для создания изображения столбчатой диаграммы
function getBarChartImage(chartData) {
    return new Promise((resolve) => {
        // Создаем временный canvas
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');

        // Создаем диаграмму
        new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                responsive: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                animation: {
                    onComplete: () => {
                        // После завершения анимации получаем данные изображения
                        const image = canvas.toDataURL('image/png');
                        resolve(image);
                    }
                }
            }
        });
    });
}

// Функция для управления возможностью перетаскивания задачи
function toggleTaskDraggable(taskElement, isDraggable) {
    if (taskElement) {
        taskElement.draggable = isDraggable;
    }
}

// Функция для сохранения текущего состояния фильтров
function saveFiltersState() {
    return {
        category: document.getElementById('category-filter').value,
        date: document.getElementById('date-filter').value,
        dateSort: document.getElementById('date-sort').value,
        status: document.querySelector('input[name="status"]:checked').value
    };
}

// Функция для восстановления состояния фильтров
function restoreFiltersState(state) {
    if (!state) return;

    document.getElementById('category-filter').value = state.category;
    document.getElementById('date-filter').value = state.date;
    document.getElementById('date-sort').value = state.dateSort;
    document.querySelector(`input[name="status"][value="${state.status}"]`).checked = true;
}

window.onload = init;
