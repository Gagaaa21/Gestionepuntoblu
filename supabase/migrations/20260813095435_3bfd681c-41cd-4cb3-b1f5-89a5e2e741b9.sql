-- 1) Blocco utenti sospesi su notification_prefs
DROP POLICY IF EXISTS "block_suspended_notification_prefs" ON public.notification_prefs;
CREATE POLICY "block_suspended_notification_prefs"
ON public.notification_prefs
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (NOT public.is_suspended(auth.uid()))
WITH CHECK (NOT public.is_suspended(auth.uid()));

-- 2) Revoca esecuzione anonima sulle funzioni interne SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.admin_revoke_all_user_sessions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_session(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_grant_office(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cron_auto_force_logout_rome() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_office_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_sport_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_transports_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_area_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_developer(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_suspended(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_active_sessions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_hidden_route_paths() FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_job_titles() FROM anon;