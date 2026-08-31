CREATE OR REPLACE FUNCTION public.prevent_must_change_password_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    -- Allow: admin users, service role (auth.uid() IS NULL), or the user clearing their own flag
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    ELSIF public.has_role(auth.uid(), 'admin') THEN
      RETURN NEW;
    ELSIF auth.uid() = NEW.id AND NEW.must_change_password = false THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Not authorized to modify must_change_password';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;