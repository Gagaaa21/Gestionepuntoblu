
-- Helper: can the caller grant/revoke the office permission?
CREATE OR REPLACE FUNCTION public.can_grant_office(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _uid AND username = 'Gabriele.Simonovich'
  )
$$;

-- Helper: does the caller have admin+office?
CREATE OR REPLACE FUNCTION public.has_office_access(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_uid, 'admin'::public.app_role)
     AND public.has_role(_uid, 'office'::public.app_role)
$$;

-- Rewrite user_roles policies so 'office' rows are hidden from non-Gabriele
DROP POLICY IF EXISTS "user_roles_select_own_or_admin" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_admin" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_admin" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete_admin" ON public.user_roles;

CREATE POLICY "user_roles_select_visible"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (role <> 'office'::public.app_role AND public.has_role(auth.uid(), 'admin'::public.app_role))
    OR public.can_grant_office(auth.uid())
  );

CREATE POLICY "user_roles_insert_scoped"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    (role <> 'office'::public.app_role AND public.has_role(auth.uid(), 'admin'::public.app_role))
    OR (role = 'office'::public.app_role AND public.can_grant_office(auth.uid()))
  );

CREATE POLICY "user_roles_update_scoped"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (
    (role <> 'office'::public.app_role AND public.has_role(auth.uid(), 'admin'::public.app_role))
    OR (role = 'office'::public.app_role AND public.can_grant_office(auth.uid()))
  )
  WITH CHECK (
    (role <> 'office'::public.app_role AND public.has_role(auth.uid(), 'admin'::public.app_role))
    OR (role = 'office'::public.app_role AND public.can_grant_office(auth.uid()))
  );

CREATE POLICY "user_roles_delete_scoped"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    (role <> 'office'::public.app_role AND public.has_role(auth.uid(), 'admin'::public.app_role))
    OR (role = 'office'::public.app_role AND public.can_grant_office(auth.uid()))
  );

-- office_service_types
CREATE TABLE public.office_service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  parent_id uuid REFERENCES public.office_service_types(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX office_service_types_parent_id_idx ON public.office_service_types(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_service_types TO authenticated;
GRANT ALL ON public.office_service_types TO service_role;

ALTER TABLE public.office_service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ost_select_office" ON public.office_service_types
  FOR SELECT TO authenticated USING (public.has_office_access(auth.uid()));
CREATE POLICY "ost_insert_office" ON public.office_service_types
  FOR INSERT TO authenticated WITH CHECK (public.has_office_access(auth.uid()));
CREATE POLICY "ost_update_office" ON public.office_service_types
  FOR UPDATE TO authenticated USING (public.has_office_access(auth.uid())) WITH CHECK (public.has_office_access(auth.uid()));
CREATE POLICY "ost_delete_office" ON public.office_service_types
  FOR DELETE TO authenticated USING (public.has_office_access(auth.uid()));

CREATE TRIGGER trg_ost_touch_updated
  BEFORE UPDATE ON public.office_service_types
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- office_services
CREATE TABLE public.office_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_full_name text,
  patient_initials text,
  service_type_id uuid REFERENCES public.office_service_types(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  service_other text,
  performed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_services_patient_xor CHECK (
    (patient_full_name IS NOT NULL AND patient_initials IS NULL)
    OR (patient_full_name IS NULL AND patient_initials IS NOT NULL)
  )
);
CREATE INDEX office_services_performed_at_idx ON public.office_services(performed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_services TO authenticated;
GRANT ALL ON public.office_services TO service_role;

ALTER TABLE public.office_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "os_select_office" ON public.office_services
  FOR SELECT TO authenticated USING (public.has_office_access(auth.uid()));
CREATE POLICY "os_insert_office" ON public.office_services
  FOR INSERT TO authenticated WITH CHECK (public.has_office_access(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "os_update_office" ON public.office_services
  FOR UPDATE TO authenticated USING (public.has_office_access(auth.uid())) WITH CHECK (public.has_office_access(auth.uid()));
CREATE POLICY "os_delete_office" ON public.office_services
  FOR DELETE TO authenticated USING (public.has_office_access(auth.uid()));

CREATE TRIGGER trg_os_touch_updated
  BEFORE UPDATE ON public.office_services
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- procedures
CREATE TABLE public.procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_type_id uuid NOT NULL UNIQUE REFERENCES public.intervention_types(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedures TO authenticated;
GRANT ALL ON public.procedures TO service_role;

ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proc_select_all_auth" ON public.procedures
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "proc_insert_admin" ON public.procedures
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "proc_update_admin" ON public.procedures
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "proc_delete_admin" ON public.procedures
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_procedures_touch_updated
  BEFORE UPDATE ON public.procedures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.office_service_types; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.office_services; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.procedures; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Bootstrap: grant office to Gabriele.Simonovich
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'office'::public.app_role FROM public.profiles WHERE username = 'Gabriele.Simonovich'
ON CONFLICT (user_id, role) DO NOTHING;
