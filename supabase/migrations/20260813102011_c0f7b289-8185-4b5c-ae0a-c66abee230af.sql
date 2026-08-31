REVOKE EXECUTE ON FUNCTION public.admin_revoke_all_user_sessions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_session(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_active_sessions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_hidden_route_paths() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cron_auto_force_logout_rome() FROM anon, authenticated;