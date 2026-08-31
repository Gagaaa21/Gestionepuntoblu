-- Revoke column-level SELECT on phone from authenticated; keep other columns readable
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, username, must_change_password, phone_prompted, guide_seen, created_at) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Remove office tables from realtime publication to prevent RLS-bypass broadcast leak
ALTER PUBLICATION supabase_realtime DROP TABLE public.office_services;
ALTER PUBLICATION supabase_realtime DROP TABLE public.office_service_types;