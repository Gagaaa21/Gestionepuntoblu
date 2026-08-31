ALTER TABLE public.transport_adi_routes
  ADD COLUMN IF NOT EXISTS kilometers_rt numeric,
  ADD COLUMN IF NOT EXISTS price_rt numeric;