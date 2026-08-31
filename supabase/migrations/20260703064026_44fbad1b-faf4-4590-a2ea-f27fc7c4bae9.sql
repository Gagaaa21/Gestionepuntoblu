
DROP FUNCTION IF EXISTS public.list_active_sessions();

CREATE FUNCTION public.list_active_sessions()
 RETURNS TABLE(session_id uuid, user_id uuid, username text, created_at timestamptz, updated_at timestamptz, not_after timestamptz, user_agent text, ip inet)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public','auth'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non autorizzato: sessione mancante' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Non autorizzato: richiesto ruolo admin o developer' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.id, s.user_id, p.username,
           s.created_at, s.updated_at, s.not_after,
           s.user_agent, s.ip
      FROM auth.sessions s
      LEFT JOIN public.profiles p ON p.id = s.user_id
     WHERE (s.not_after IS NULL OR s.not_after > now())
     ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_active_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_sessions() TO authenticated;
