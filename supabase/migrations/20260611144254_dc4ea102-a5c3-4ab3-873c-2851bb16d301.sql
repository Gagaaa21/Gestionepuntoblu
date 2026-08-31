
ALTER TABLE public.intervention_types
  ADD COLUMN parent_id uuid REFERENCES public.intervention_types(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS intervention_types_parent_id_idx
  ON public.intervention_types(parent_id);
