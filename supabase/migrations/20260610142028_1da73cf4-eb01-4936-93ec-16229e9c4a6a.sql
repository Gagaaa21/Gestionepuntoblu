
CREATE OR REPLACE FUNCTION public.prevent_must_change_password_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized to modify must_change_password';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_must_change_password ON public.profiles;
CREATE TRIGGER profiles_guard_must_change_password
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_must_change_password_self_update();
