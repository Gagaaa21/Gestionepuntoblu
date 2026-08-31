
-- Fix daily auto-logout: pg_cron runs in UTC. Use every-minute schedule with
-- a Europe/Rome time check so both 00:01 and 14:10 local time are handled
-- correctly across DST transitions.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('daily-force-logout-all-users');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('auto-force-logout-rome');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.cron_auto_force_logout_rome()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  t text := to_char((now() AT TIME ZONE 'Europe/Rome'), 'HH24:MI');
BEGIN
  IF t IN ('00:01','14:10') THEN
    UPDATE public.profiles SET force_logout_at = now();
    INSERT INTO public.audit_log(actor_id, action, entity, details)
      VALUES (NULL, 'DAILY_FORCE_LOGOUT', 'auth',
              jsonb_build_object('rome_time', t, 'stamp', now()));
  END IF;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cron_auto_force_logout_rome() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'auto-force-logout-rome',
  '* * * * *',
  $$ SELECT public.cron_auto_force_logout_rome(); $$
);
