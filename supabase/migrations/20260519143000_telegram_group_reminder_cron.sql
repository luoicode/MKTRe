CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('mktre-telegram-group-reminders-tick');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'mktre-telegram-group-reminders-tick',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := 'https://esipgbggkvdpbttcfbqx.supabase.co/functions/v1/telegram-group-reminders',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"action":"tick"}'::jsonb,
      timeout_milliseconds := 15000
    );
  $$
);
