CREATE TABLE IF NOT EXISTS public.transport_adi_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  departure text NOT NULL,
  arrival text NOT NULL,
  alias text,
  kilometers numeric NOT NULL DEFAULT 0,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_adi_routes TO authenticated;
GRANT ALL ON public.transport_adi_routes TO service_role;

ALTER TABLE public.transport_adi_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "adi routes access" ON public.transport_adi_routes;
CREATE POLICY "adi routes access" ON public.transport_adi_routes
  FOR ALL TO authenticated
  USING (has_transports_access(auth.uid()))
  WITH CHECK (has_transports_access(auth.uid()));

DROP POLICY IF EXISTS "block_suspended_adi_routes" ON public.transport_adi_routes;
CREATE POLICY "block_suspended_adi_routes" ON public.transport_adi_routes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT is_suspended(auth.uid()))
  WITH CHECK (NOT is_suspended(auth.uid()));

DROP TRIGGER IF EXISTS touch_transport_adi_routes ON public.transport_adi_routes;
CREATE TRIGGER touch_transport_adi_routes
  BEFORE UPDATE ON public.transport_adi_routes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS transport_adi_routes_alias_key
  ON public.transport_adi_routes (lower(alias)) WHERE alias IS NOT NULL AND alias <> '';