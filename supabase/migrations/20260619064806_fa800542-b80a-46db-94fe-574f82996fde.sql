-- 1) Profiles: protezione del numero di telefono via grant a livello di colonna.
--    La policy RLS resta USING(true) per permettere la lookup dello username,
--    ma il client non potrà più leggere la colonna phone (solo il service role).
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, username, must_change_password, created_at, guide_seen, phone_prompted)
  ON public.profiles TO authenticated;
-- Necessari per INSERT/UPDATE dal client (consentiti dalle policy esistenti).
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- 2) auth_login_attempts: marca esplicitamente come tabella server-only.
COMMENT ON TABLE public.auth_login_attempts IS
  'Server-only: scritta esclusivamente dalle server function tramite service_role. Nessuna policy RLS necessaria: l''accesso client è negato di default.';

-- 3) SECURITY DEFINER: revoca EXECUTE a PUBLIC/anon su tutte le funzioni interne.
--    Restano callable da authenticated e service_role (dove servono per RLS/trigger).
REVOKE EXECUTE ON FUNCTION public.is_developer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_office_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_grant_office(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_must_change_password_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_username_self_update() FROM PUBLIC, anon, authenticated;