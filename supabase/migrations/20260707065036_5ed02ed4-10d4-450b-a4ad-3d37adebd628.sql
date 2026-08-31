
-- 1. Restrictive policies on auth_login_attempts (service_role bypasses RLS)
CREATE POLICY "auth_login_attempts no client access select"
  ON public.auth_login_attempts FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "auth_login_attempts no client access insert"
  ON public.auth_login_attempts FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "auth_login_attempts no client access update"
  ON public.auth_login_attempts FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "auth_login_attempts no client access delete"
  ON public.auth_login_attempts FOR DELETE TO anon, authenticated USING (false);

-- 2. Revoke EXECUTE from anon on trigger/definer helpers that must never be
--    invoked directly by clients.
REVOKE EXECUTE ON FUNCTION public.prevent_job_title_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_force_logout_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_must_change_password_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_username_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_phone_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_suspension_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- 3. Revoke direct EXECUTE from anon on internal admin RPCs / helpers. Keep authenticated where server fns rely on them.
REVOKE EXECUTE ON FUNCTION public.admin_revoke_all_user_sessions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_session(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_active_sessions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_office_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_grant_office(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_developer(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_suspended(uuid) FROM anon;

-- 4. Add unique constraint helper to reduce duplicate patient folders (same name+created_by within a short window)
--    (Best-effort — real dedup is enforced client-side; here we prevent exact simultaneous duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS patients_unique_name_creator
  ON public.patients (lower(first_name), lower(last_name), created_by);
