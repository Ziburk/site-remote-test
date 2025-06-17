// Инициализация Telegram виджета
function initTelegramAuth(botName) {
    const container = document.getElementById('telegram-login-container');
    
    // Очищаем контейнер перед добавлением нового виджета
    container.innerHTML = '';

    window.TelegramLoginWidget = {
        dataOnauth: function(user) {
            onTelegramAuth(user);
        }
    };

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', 'medium');
    script.setAttribute('data-radius', '4');
    script.setAttribute('data-onauth', 'TelegramLoginWidget.dataOnauth(user)');
    script.setAttribute('data-request-access', 'write');
    
    // Добавляем поддержку всех доменов
    script.setAttribute('data-auth-url', window.location.origin);

    container.appendChild(script);
}

// Функция для установки куки
function setCookie(name, value, days) {
    let expires = '';
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = '; expires=' + date.toUTCString();
    }
    document.cookie = name + '=' + (value || '') + expires + '; path=/';
}

// Функция для удаления куки
function deleteCookie(name) {
    document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

// Обработка авторизации через Telegram
async function onTelegramAuth(user) {
    try {
        const response = await fetch('/api/auth/telegram', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(user)
        });

        if (!response.ok) {
            throw new Error('Ошибка авторизации');
        }

        const data = await response.json();
        
        // Сохраняем токен и данные пользователя
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('telegramUser', JSON.stringify(user));
        setCookie('auth_token', data.token, 1); // Сохраняем токен в куки на 1 день
        
        // Обновляем UI
        updateUIForLoggedInUser(user);
        
        // Обновляем токен в API
        if (window.todoAPI) {
            window.todoAPI.setToken(data.token);
        }
    } catch (error) {
        console.error('Ошибка при авторизации:', error);
        alert('Произошла ошибка при авторизации. Пожалуйста, попробуйте снова.');
    }
}

// Обновление UI для авторизованного пользователя
function updateUIForLoggedInUser(user) {
    const loginContainer = document.getElementById('telegram-login-container');
    const userProfile = document.getElementById('user-profile');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');

    loginContainer.classList.add('hidden');
    userProfile.classList.remove('hidden');

    // Устанавливаем данные пользователя
    if (user.photo_url) {
        userAvatar.src = user.photo_url;
    }
    userName.textContent = user.first_name + (user.last_name ? ' ' + user.last_name : '');
}

// Выход из аккаунта
function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('telegramUser');
    deleteCookie('auth_token');
    
    const loginContainer = document.getElementById('telegram-login-container');
    const userProfile = document.getElementById('user-profile');

    userProfile.classList.add('hidden');
    loginContainer.classList.remove('hidden');
    
    // Переинициализируем виджет входа
    initTelegramAuth('ZiburkToDoListBot');
    
    // Перезагружаем страницу для сброса состояния
    window.location.href = '/login.html';
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Проверяем, авторизован ли пользователь
    const savedUser = localStorage.getItem('telegramUser');
    const token = localStorage.getItem('auth_token');
    
    if (savedUser && token) {
        // Проверяем валидность токена
        fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (response.ok) {
                updateUIForLoggedInUser(JSON.parse(savedUser));
            } else {
                // Если токен невалиден, выполняем выход
                logout();
            }
        })
        .catch(() => logout());
    } else {
        // Если мы на главной странице и нет токена, перенаправляем на страницу входа
        if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
            window.location.href = '/login.html';
        } else {
            // Инициализируем виджет входа
            initTelegramAuth('ZiburkToDoListBot');
        }
    }

    // Добавляем обработчик для кнопки выхода
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
}); 