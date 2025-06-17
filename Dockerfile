FROM node:18-alpine

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем только production зависимости
RUN npm install --production

# Копируем все файлы проекта
COPY . .

# Устанавливаем переменные окружения
ENV PORT=3000
ENV DOMAIN=m8sd-fgju-kuuh.gw-1a.dockhost.net

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "start"] 