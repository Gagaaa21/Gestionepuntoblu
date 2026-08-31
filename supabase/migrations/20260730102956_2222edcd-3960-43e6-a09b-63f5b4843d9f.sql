-- 1) Preserva i permessi attuali degli utenti esistenti (che si basavano sul default implicito true)
INSERT INTO public.user_permissions (user_id)
SELECT p.id FROM public.profiles p
LEFT JOIN public.user_permissions up ON up.user_id = p.id
WHERE up.user_id IS NULL;

-- 2) Default sicuri (deny) per i permessi sensibili
ALTER TABLE public.user_permissions
  ALTER COLUMN can_view_others_interventions SET DEFAULT false,
  ALTER COLUMN can_manage_anagraphics SET DEFAULT false;

-- 3) has_permission: nega se non esiste una riga esplicita
CREATE OR REPLACE FUNCTION public.has_permission(_uid uuid, _perm text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v boolean;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _perm !~ '^[a-z_]+$' THEN RAISE EXCEPTION 'Permesso non valido'; END IF;
  IF public.has_role(_uid, 'admin'::public.app_role) THEN RETURN true; END IF;
  EXECUTE format('SELECT COALESCE((SELECT %I FROM public.user_permissions WHERE user_id = $1), false)', _perm)
    INTO v USING _uid;
  RETURN COALESCE(v, false);
END;
$function$;