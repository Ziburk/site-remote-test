# Этап сборки
FROM node:18-alpine as builder

WORKDIR /app

# Копируем файлы package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Собираем приложение в production режиме
RUN npm run build

# Этап production
FROM node:18-alpine

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем только production зависимости
RUN npm install --production

# Копируем собранное приложение из этапа сборки
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY .env ./

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "start"] 