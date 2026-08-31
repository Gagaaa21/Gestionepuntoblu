ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS vitals_timeline jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.interventions.vitals_timeline IS
  'Array of vital-signs measurements taken at successive times during the same intervention. Each item: { label: "T1"|"T2"..., measured_at: ISO string, vs_pas, vs_pad, vs_fc, vs_fr, vs_spo2, vs_temp, vs_glicemia }. Edited under the same RLS as the parent intervention row.';
