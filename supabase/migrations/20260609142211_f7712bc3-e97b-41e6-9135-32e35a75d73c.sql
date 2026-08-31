
-- 1. Operator name on interventions
ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS operator_username text;

-- 2. Admin update policies
CREATE POLICY "patients_update_admin" ON public.patients
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "interventions_update_admin" ON public.interventions
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow all authenticated to read usernames (for displaying operator on interventions)
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_all_auth" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- 3. Checklist items (admin-managed content)
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  pieces integer NOT NULL DEFAULT 1,
  location text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO authenticated;
GRANT ALL ON public.checklist_items TO service_role;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_items_select_all" ON public.checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_items_insert_admin" ON public.checklist_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "checklist_items_update_admin" ON public.checklist_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "checklist_items_delete_admin" ON public.checklist_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Checklist daily checks (per user per day)
CREATE TABLE public.checklist_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  checked_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id, checked_on)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_checks TO authenticated;
GRANT ALL ON public.checklist_checks TO service_role;
ALTER TABLE public.checklist_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_checks_select_all" ON public.checklist_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_checks_insert_own" ON public.checklist_checks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "checklist_checks_delete_own" ON public.checklist_checks FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 5. Inventory
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  expiry_date date,
  location text NOT NULL DEFAULT '',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_select_all" ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_insert_auth" ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "inventory_update_auth" ON public.inventory_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "inventory_delete_admin" ON public.inventory_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_checklist_items_updated BEFORE UPDATE ON public.checklist_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_inventory_items_updated BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
