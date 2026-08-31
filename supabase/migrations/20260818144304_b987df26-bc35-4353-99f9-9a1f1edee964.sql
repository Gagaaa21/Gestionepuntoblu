CREATE OR REPLACE FUNCTION public.has_permission(_uid uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v boolean;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _perm NOT IN (
    'can_create_interventions',
    'can_modify_own_interventions',
    'can_view_others_interventions',
    'can_manage_anagraphics',
    'can_manage_transports',
    'can_manage_sport'
  ) THEN
    RAISE EXCEPTION 'Permesso non valido';
  END IF;
  IF public.has_role(_uid, 'admin'::public.app_role) THEN RETURN true; END IF;
  EXECUTE format('SELECT COALESCE((SELECT %I FROM public.user_permissions WHERE user_id = $1), false)', _perm)
    INTO v USING _uid;
  RETURN COALESCE(v, false);
END;
$function$;

DROP POLICY IF EXISTS "block_suspended" ON public.intervention_types;
CREATE POLICY "block_suspended"
ON public.intervention_types
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (NOT public.is_suspended(auth.uid()))
WITH CHECK (NOT public.is_suspended(auth.uid()));

DROP POLICY IF EXISTS "block_suspended" ON public.procedures;
CREATE POLICY "block_suspended"
ON public.procedures
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (NOT public.is_suspended(auth.uid()))
WITH CHECK (NOT public.is_suspended(auth.uid()));