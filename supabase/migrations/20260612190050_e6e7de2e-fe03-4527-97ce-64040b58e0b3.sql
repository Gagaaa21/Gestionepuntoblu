CREATE OR REPLACE FUNCTION public.prevent_must_change_password_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role
    ELSIF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Not authorized to modify must_change_password';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;