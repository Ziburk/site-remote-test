FROM node:18-alpine

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем только production зависимости
RUN npm install --production

# Копируем все файлы проекта
COPY . .

# Устанавливаем переменную окружения для порта
ENV PORT=3000

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "start"] 