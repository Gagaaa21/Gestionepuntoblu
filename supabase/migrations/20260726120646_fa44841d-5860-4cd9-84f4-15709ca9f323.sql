REVOKE EXECUTE ON FUNCTION public.has_sport_access(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_sport_access(uuid) TO authenticated, service_role;