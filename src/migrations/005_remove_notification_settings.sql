-- Удаление таблицы notification_settings
DROP TABLE IF EXISTS notification_settings CASCADE;

-- Удаление индекса
DROP INDEX IF EXISTS idx_notification_settings_user_id; 