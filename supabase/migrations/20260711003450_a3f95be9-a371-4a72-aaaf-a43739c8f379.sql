
CREATE TABLE public.operator_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_at timestamptz NOT NULL DEFAULT now(),
  checkin_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Rome')::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, checkin_date)
);

GRANT SELECT, INSERT ON public.operator_checkins TO authenticated;
GRANT ALL ON public.operator_checkins TO service_role;

ALTER TABLE public.operator_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checkins"
  ON public.operator_checkins FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can insert own checkins"
  ON public.operator_checkins FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_operator_checkins_user_date ON public.operator_checkins (user_id, checkin_date DESC);
