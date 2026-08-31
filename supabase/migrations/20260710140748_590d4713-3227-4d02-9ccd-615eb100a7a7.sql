
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS broadcast_id uuid;

CREATE INDEX IF NOT EXISTS notifications_broadcast_id_idx
  ON public.notifications(broadcast_id) WHERE broadcast_id IS NOT NULL;
