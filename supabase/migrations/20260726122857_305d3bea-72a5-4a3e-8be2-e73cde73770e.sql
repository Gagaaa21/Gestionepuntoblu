ALTER TABLE public.sport_services
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS crew_changes jsonb NOT NULL DEFAULT '[]'::jsonb;