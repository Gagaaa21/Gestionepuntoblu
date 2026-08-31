ALTER TABLE public.secondary_transports
  ADD COLUMN IF NOT EXISTS first_name_2 text,
  ADD COLUMN IF NOT EXISTS last_name_2 text;