-- Добавляем столбцы для уведомлений
ALTER TABLE tasks
ADD COLUMN notifications_enabled BOOLEAN DEFAULT false,
ADD COLUMN notification_time TIMESTAMP WITH TIME ZONE;

-- Создаем индекс для оптимизации запросов по времени уведомления
CREATE INDEX idx_tasks_notification ON tasks(notification_time) 
WHERE notifications_enabled = true; 