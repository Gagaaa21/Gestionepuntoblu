
-- Vital signs columns on interventions (all optional)
ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS vs_pas integer,
  ADD COLUMN IF NOT EXISTS vs_pad integer,
  ADD COLUMN IF NOT EXISTS vs_fc integer,
  ADD COLUMN IF NOT EXISTS vs_fr integer,
  ADD COLUMN IF NOT EXISTS vs_spo2 integer,
  ADD COLUMN IF NOT EXISTS vs_temp numeric(4,1),
  ADD COLUMN IF NOT EXISTS vs_glicemia integer;

-- Allow intervention without a patient (Paziente Sconosciuto)
ALTER TABLE public.interventions ALTER COLUMN patient_id DROP NOT NULL;

-- intervention_types: admin-managed labels
CREATE TABLE IF NOT EXISTS public.intervention_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intervention_types TO authenticated;
GRANT ALL ON public.intervention_types TO service_role;
ALTER TABLE public.intervention_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "types readable by authenticated" ON public.intervention_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "types insert by admin" ON public.intervention_types FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "types update by admin" ON public.intervention_types FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "types delete by admin" ON public.intervention_types FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_intervention_types_updated BEFORE UPDATE ON public.intervention_types FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Checklist hierarchy: parent_id self reference
ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.checklist_items(id) ON DELETE CASCADE;
ALTER TABLE public.checklist_items ALTER COLUMN pieces DROP NOT NULL;
ALTER TABLE public.checklist_items ALTER COLUMN location DROP NOT NULL;

-- Checklist completion log: operator marked checklist as completed today
CREATE TABLE IF NOT EXISTS public.checklist_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  username text NOT NULL,
  completed_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, completed_on)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_completions TO authenticated;
GRANT ALL ON public.checklist_completions TO service_role;
ALTER TABLE public.checklist_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "completions readable" ON public.checklist_completions FOR SELECT TO authenticated USING (true);
CREATE POLICY "completions own insert" ON public.checklist_completions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "completions own delete" ON public.checklist_completions FOR DELETE TO authenticated USING (auth.uid() = user_id);
