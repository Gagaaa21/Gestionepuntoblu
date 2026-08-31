CREATE TYPE public.report_urgency AS ENUM ('urgent','deferrable','not_urgent');
CREATE TYPE public.report_status AS ENUM ('new','in_progress','resolved','ignored');

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  report_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date,
  problem text NOT NULL,
  urgency public.report_urgency NOT NULL DEFAULT 'not_urgent',
  status public.report_status NOT NULL DEFAULT 'new',
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view reports"
  ON public.reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create own reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner or admin can update reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner or admin can delete reports"
  ON public.reports FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER reports_touch_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();