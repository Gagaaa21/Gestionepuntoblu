
-- 1) Replace username-based check with role-based check (developer role is bootstrapped only for Gabriele.Simonovich)
CREATE OR REPLACE FUNCTION public.can_grant_office(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_uid, 'developer'::public.app_role)
$$;

-- 2) Prevent users from changing their own username (defense in depth)
CREATE OR REPLACE FUNCTION public.prevent_username_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role
    ELSIF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Not authorized to change username';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_username_self_update ON public.profiles;
CREATE TRIGGER trg_prevent_username_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_username_self_update();

-- 3) Lock down SECURITY DEFINER helpers from anon/public execution
REVOKE EXECUTE ON FUNCTION public.can_grant_office(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_office_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_username_self_update() FROM PUBLIC, anon, authenticated;
