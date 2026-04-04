CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT
  cron.schedule(
    'finish-abandoned-workouts',
    '*/30 * * * *',
    $$
    SELECT
      net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/finish-abandoned-workouts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        ),
        body := '{}'::jsonb
      );
    $$
  );
