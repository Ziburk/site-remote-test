FROM node:18-alpine

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем только production зависимости
RUN npm install --production

# Копируем собранные файлы и исходный код
COPY dist ./dist
COPY src ./src
COPY .env ./

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "start"] 