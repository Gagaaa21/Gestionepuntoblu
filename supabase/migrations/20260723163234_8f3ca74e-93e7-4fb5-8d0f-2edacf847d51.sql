
-- 1) Permesso "trasporti" su user_permissions
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_manage_transports boolean NOT NULL DEFAULT false;

-- 2) Funzione helper d'accesso
CREATE OR REPLACE FUNCTION public.has_transports_access(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_uid, 'admin'::public.app_role)
     AND COALESCE(
       (SELECT can_manage_transports FROM public.user_permissions WHERE user_id = _uid),
       false
     )
$$;

-- 3) Ospedali
CREATE TABLE IF NOT EXISTS public.transport_hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_hospitals TO authenticated;
GRANT ALL ON public.transport_hospitals TO service_role;
ALTER TABLE public.transport_hospitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hospitals access" ON public.transport_hospitals
  FOR ALL TO authenticated
  USING (public.has_transports_access(auth.uid()))
  WITH CHECK (public.has_transports_access(auth.uid()));

-- 4) Tariffe standard (una sola riga)
CREATE TABLE IF NOT EXISTS public.transport_tariffs (
  id text PRIMARY KEY,
  per_km numeric NOT NULL DEFAULT 1.46,
  sosta_hourly numeric NOT NULL DEFAULT 15,
  nurse_hourly numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.transport_tariffs(id) VALUES ('default') ON CONFLICT DO NOTHING;
GRANT SELECT, UPDATE ON public.transport_tariffs TO authenticated;
GRANT ALL ON public.transport_tariffs TO service_role;
ALTER TABLE public.transport_tariffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tariffs read" ON public.transport_tariffs
  FOR SELECT TO authenticated USING (public.has_transports_access(auth.uid()));
CREATE POLICY "tariffs update" ON public.transport_tariffs
  FOR UPDATE TO authenticated
  USING (public.has_transports_access(auth.uid()))
  WITH CHECK (public.has_transports_access(auth.uid()));

-- 5) Tariffe intraospedaliere per coppia partenza->arrivo
CREATE TABLE IF NOT EXISTS public.transport_intra_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  departure_id uuid NOT NULL REFERENCES public.transport_hospitals(id) ON DELETE CASCADE,
  arrival_id uuid NOT NULL REFERENCES public.transport_hospitals(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (departure_id, arrival_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_intra_tariffs TO authenticated;
GRANT ALL ON public.transport_intra_tariffs TO service_role;
ALTER TABLE public.transport_intra_tariffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intra tariffs access" ON public.transport_intra_tariffs
  FOR ALL TO authenticated
  USING (public.has_transports_access(auth.uid()))
  WITH CHECK (public.has_transports_access(auth.uid()));

-- 6) Trasporti secondari
DO $$ BEGIN
  CREATE TYPE public.transport_kind AS ENUM ('intra','other','nurse');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.secondary_transports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.transport_kind NOT NULL,
  transport_date timestamptz NOT NULL DEFAULT now(),
  first_name text,
  last_name text,
  departure_hospital_id uuid REFERENCES public.transport_hospitals(id) ON DELETE SET NULL,
  arrival_hospital_id uuid REFERENCES public.transport_hospitals(id) ON DELETE SET NULL,
  departure_text text,
  arrival_text text,
  kilometers numeric,
  price numeric,
  sosta_hours numeric DEFAULT 0,
  sosta_price numeric DEFAULT 0,
  nurse_hours numeric,
  nurse_hourly numeric,
  notes text,
  user_id uuid,
  username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_secondary_transports_date ON public.secondary_transports (transport_date);
CREATE INDEX IF NOT EXISTS idx_secondary_transports_kind ON public.secondary_transports (kind);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.secondary_transports TO authenticated;
GRANT ALL ON public.secondary_transports TO service_role;
ALTER TABLE public.secondary_transports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transports access" ON public.secondary_transports
  FOR ALL TO authenticated
  USING (public.has_transports_access(auth.uid()))
  WITH CHECK (public.has_transports_access(auth.uid()));

-- 7) Triggers updated_at
DROP TRIGGER IF EXISTS trg_hospitals_updated ON public.transport_hospitals;
CREATE TRIGGER trg_hospitals_updated BEFORE UPDATE ON public.transport_hospitals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_tariffs_updated ON public.transport_tariffs;
CREATE TRIGGER trg_tariffs_updated BEFORE UPDATE ON public.transport_tariffs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_intra_updated ON public.transport_intra_tariffs;
CREATE TRIGGER trg_intra_updated BEFORE UPDATE ON public.transport_intra_tariffs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_secondary_updated ON public.secondary_transports;
CREATE TRIGGER trg_secondary_updated BEFORE UPDATE ON public.secondary_transports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
