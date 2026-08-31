
-- Job title on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title text
  CHECK (job_title IS NULL OR job_title IN ('soccorritore','infermiere','medico'));

-- Trigger: only developer role (or service_role) can change job_title
CREATE OR REPLACE FUNCTION public.prevent_job_title_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.job_title IS DISTINCT FROM OLD.job_title THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role
    ELSIF public.has_role(auth.uid(), 'developer'::public.app_role) THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Solo il programmatore può modificare la qualifica';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_job_title_self_update ON public.profiles;
CREATE TRIGGER trg_prevent_job_title_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_job_title_self_update();

-- Announcement support on notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS requires_ack boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
