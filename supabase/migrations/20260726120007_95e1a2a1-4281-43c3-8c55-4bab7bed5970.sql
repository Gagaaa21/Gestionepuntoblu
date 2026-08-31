-- 1. Permission column
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS can_manage_sport boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.has_sport_access(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'admin'::public.app_role)
     AND COALESCE((SELECT can_manage_sport FROM public.user_permissions WHERE user_id = _uid), false)
$$;

-- 2. Vehicles
CREATE TABLE IF NOT EXISTS public.sport_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text,
  kind text NOT NULL DEFAULT 'ambulanza',
  out_of_service boolean NOT NULL DEFAULT false,
  oos_from timestamptz,
  oos_to timestamptz,
  oos_reason text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sport_vehicles TO authenticated;
GRANT ALL ON public.sport_vehicles TO service_role;
ALTER TABLE public.sport_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sport_vehicles_access" ON public.sport_vehicles FOR ALL TO authenticated
  USING (public.has_sport_access(auth.uid())) WITH CHECK (public.has_sport_access(auth.uid()));
CREATE POLICY "sport_vehicles_block_suspended" ON public.sport_vehicles AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_suspended(auth.uid())) WITH CHECK (NOT public.is_suspended(auth.uid()));

-- 3. Services
CREATE TABLE IF NOT EXISTS public.sport_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL,
  event_name text NOT NULL,
  start_time time,
  end_time time,
  location text,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  doctor_name text,
  meal_voucher boolean NOT NULL DEFAULT false,
  als_backpack boolean NOT NULL DEFAULT false,
  color text NOT NULL DEFAULT '#1e3a8a',
  notes text,
  done boolean NOT NULL DEFAULT false,
  created_by uuid,
  username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sport_services_date_idx ON public.sport_services (event_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sport_services TO authenticated;
GRANT ALL ON public.sport_services TO service_role;
ALTER TABLE public.sport_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sport_services_access" ON public.sport_services FOR ALL TO authenticated
  USING (public.has_sport_access(auth.uid())) WITH CHECK (public.has_sport_access(auth.uid()));
CREATE POLICY "sport_services_block_suspended" ON public.sport_services AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_suspended(auth.uid())) WITH CHECK (NOT public.is_suspended(auth.uid()));

-- 4. Attachments
CREATE TABLE IF NOT EXISTS public.sport_service_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.sport_services(id) ON DELETE CASCADE,
  path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sport_service_files_service_idx ON public.sport_service_files (service_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sport_service_files TO authenticated;
GRANT ALL ON public.sport_service_files TO service_role;
ALTER TABLE public.sport_service_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sport_files_access" ON public.sport_service_files FOR ALL TO authenticated
  USING (public.has_sport_access(auth.uid())) WITH CHECK (public.has_sport_access(auth.uid()));
CREATE POLICY "sport_files_block_suspended" ON public.sport_service_files AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_suspended(auth.uid())) WITH CHECK (NOT public.is_suspended(auth.uid()));

-- 5. updated_at triggers
CREATE TRIGGER sport_vehicles_touch BEFORE UPDATE ON public.sport_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sport_services_touch BEFORE UPDATE ON public.sport_services
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();