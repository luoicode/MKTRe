CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('mktre-facebook-ad-spend-sync-vn');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
  'mktre-facebook-ad-spend-sync-vn',
  '0 1,5,7,10,13,15,16 * * *',
  $$
    SELECT net.http_post(
      url := 'https://esipgbggkvdpbttcfbqx.supabase.co/functions/v1/facebook-ad-spend-sync?date=' ||
        to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD'),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"source":"pg_cron","job":"mktre-facebook-ad-spend-sync-vn"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
