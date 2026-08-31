
CREATE TABLE IF NOT EXISTS public.site_customizations (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.site_customizations TO authenticated;
GRANT SELECT ON public.site_customizations TO anon;
GRANT ALL ON public.site_customizations TO service_role;

ALTER TABLE public.site_customizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read customizations"
  ON public.site_customizations FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "developers can insert customizations"
  ON public.site_customizations FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'developer'));

CREATE POLICY "developers can update customizations"
  ON public.site_customizations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'developer'))
  WITH CHECK (public.has_role(auth.uid(), 'developer'));

CREATE POLICY "developers can delete customizations"
  ON public.site_customizations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'developer'));

CREATE TRIGGER site_customizations_touch
  BEFORE UPDATE ON public.site_customizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.interventions ADD COLUMN IF NOT EXISTS extra_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_data jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'developer'::public.app_role
FROM public.profiles
WHERE username = 'Gabriele.Simonovich'
ON CONFLICT (user_id, role) DO NOTHING;
