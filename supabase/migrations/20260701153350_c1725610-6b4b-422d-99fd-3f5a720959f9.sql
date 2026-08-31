
-- Add force_logout_at for instant admin logout and daily auto-logout
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS force_logout_at timestamptz;

-- Prevent non-admins from tampering with this field via Data API
CREATE OR REPLACE FUNCTION public.prevent_force_logout_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.force_logout_at IS DISTINCT FROM OLD.force_logout_at THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role / cron
    ELSIF public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'developer'::public.app_role) THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Non autorizzato a modificare force_logout_at';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_force_logout_self_update_trg ON public.profiles;
CREATE TRIGGER prevent_force_logout_self_update_trg
BEFORE UPDATE OF force_logout_at ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_force_logout_self_update();

-- Ensure realtime carries the new column
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Daily auto-logout at 00:01
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any previous schedule with the same name
DO $$ BEGIN
  PERFORM cron.unschedule('daily-force-logout-all-users');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'daily-force-logout-all-users',
  '1 0 * * *',
  $$ UPDATE public.profiles SET force_logout_at = now(); $$
);
