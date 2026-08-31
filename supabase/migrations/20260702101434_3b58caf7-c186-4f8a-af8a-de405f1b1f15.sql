CREATE OR REPLACE FUNCTION public.list_active_sessions()
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  username text,
  full_name text,
  created_at timestamptz,
  updated_at timestamptz,
  not_after timestamptz,
  user_agent text,
  ip inet
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  RETURN QUERY
    SELECT s.id, s.user_id, p.username, p.full_name,
           s.created_at, s.updated_at, s.not_after,
           s.user_agent, s.ip
      FROM auth.sessions s
      LEFT JOIN public.profiles p ON p.id = s.user_id
     WHERE (s.not_after IS NULL OR s.not_after > now())
     ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_active_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_sessions() TO authenticated;