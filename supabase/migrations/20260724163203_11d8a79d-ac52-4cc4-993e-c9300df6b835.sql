
ALTER TABLE public.transport_hospitals ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'hospital';
ALTER TABLE public.transport_tariffs ADD COLUMN IF NOT EXISTS detailed_time BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.secondary_transports 
  ADD COLUMN IF NOT EXISTS is_round_trip BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS annullato BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS departure_time TEXT,
  ADD COLUMN IF NOT EXISTS arrival_time TEXT;
-- kilometers column already exists on secondary_transports; keep it nullable
