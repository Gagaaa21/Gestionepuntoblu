ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS fuori_sede boolean NOT NULL DEFAULT false;