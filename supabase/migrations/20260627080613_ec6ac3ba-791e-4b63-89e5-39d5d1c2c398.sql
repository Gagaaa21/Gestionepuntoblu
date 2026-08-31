
-- 1) Patient notes
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS notes_color text;

-- 2) Hardening: revoke suspension column updates from authenticated
REVOKE UPDATE (suspended_at, suspended_until, suspended_reason, suspended_by) ON public.profiles FROM authenticated;

-- 3) Revoke EXECUTE from anon/PUBLIC on internal SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_suspended(uuid) FROM PUBLIC, anon;
-- trigger functions: keep only postgres
REVOKE EXECUTE ON FUNCTION public.prevent_suspension_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_phone_self_update() FROM PUBLIC, anon, authenticated;

-- 4) Tighten site_customizations anon access to only the privacy/colors keys
DROP POLICY IF EXISTS "anyone can read customizations" ON public.site_customizations;
CREATE POLICY "anon read public customizations" ON public.site_customizations
  FOR SELECT TO anon
  USING (key IN ('__colors__','__privacy__','__public__'));
CREATE POLICY "auth read customizations" ON public.site_customizations
  FOR SELECT TO authenticated
  USING (true);
