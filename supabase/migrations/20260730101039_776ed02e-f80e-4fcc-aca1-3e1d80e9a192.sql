-- Macro aree
CREATE TABLE public.areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT 'navy',
  icon text NOT NULL DEFAULT 'layers',
  tabs jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.areas TO authenticated;
GRANT ALL ON public.areas TO service_role;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.area_members (
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (area_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.area_members TO authenticated;
GRANT ALL ON public.area_members TO service_role;
ALTER TABLE public.area_members ENABLE ROW LEVEL SECURITY;

-- helper
CREATE OR REPLACE FUNCTION public.is_area_member(_uid uuid, _area_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.area_members m WHERE m.user_id = _uid AND m.area_id = _area_id)
$$;
REVOKE EXECUTE ON FUNCTION public.is_area_member(uuid, uuid) FROM anon;

-- Policies areas
CREATE POLICY "areas_select_members_or_admin" ON public.areas
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.is_area_member(auth.uid(), id)
  );

CREATE POLICY "areas_admin_write" ON public.areas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "block_suspended" ON public.areas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_suspended(auth.uid()))
  WITH CHECK (NOT public.is_suspended(auth.uid()));

-- Policies area_members
CREATE POLICY "area_members_select_self_or_admin" ON public.area_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

CREATE POLICY "area_members_admin_write" ON public.area_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "block_suspended" ON public.area_members
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_suspended(auth.uid()))
  WITH CHECK (NOT public.is_suspended(auth.uid()));

CREATE TRIGGER touch_areas_updated_at
  BEFORE UPDATE ON public.areas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Visibilità admin nei contatti
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_in_contacts boolean NOT NULL DEFAULT true;