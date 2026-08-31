
-- 1) surveys table
CREATE TABLE public.surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  subject text,
  description text,
  active boolean NOT NULL DEFAULT true,
  public_results boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.surveys TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.surveys TO authenticated;
GRANT ALL ON public.surveys TO service_role;

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active surveys" ON public.surveys
  FOR SELECT USING (active = true);
CREATE POLICY "Admins can view all surveys" ON public.surveys
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));
CREATE POLICY "Admins manage surveys" ON public.surveys
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));

CREATE TRIGGER trg_surveys_updated_at BEFORE UPDATE ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Default survey to migrate existing rows
INSERT INTO public.surveys (slug, name, subject, description)
VALUES ('punto-blu', 'Questionario Punto Blu', 'Servizio ambulatoriale Punto Blu', 'Il tuo parere sul servizio offerto presso l''ambulatorio Punto Blu.');

-- 3) Link existing questions/responses
ALTER TABLE public.survey_questions ADD COLUMN survey_id uuid REFERENCES public.surveys(id) ON DELETE CASCADE;
UPDATE public.survey_questions SET survey_id = (SELECT id FROM public.surveys WHERE slug='punto-blu');
ALTER TABLE public.survey_questions ALTER COLUMN survey_id SET NOT NULL;
CREATE INDEX survey_questions_survey_pos_idx ON public.survey_questions(survey_id, position);

ALTER TABLE public.survey_responses ADD COLUMN survey_id uuid REFERENCES public.surveys(id) ON DELETE CASCADE;
ALTER TABLE public.survey_responses ADD COLUMN privacy_consent boolean NOT NULL DEFAULT false;
UPDATE public.survey_responses SET survey_id = (SELECT id FROM public.surveys WHERE slug='punto-blu');
ALTER TABLE public.survey_responses ALTER COLUMN survey_id SET NOT NULL;
CREATE INDEX survey_responses_survey_created_idx ON public.survey_responses(survey_id, created_at DESC);

-- 4) Ensure anon can read questions and responses (public feedback + public results)
GRANT SELECT ON public.survey_questions TO anon;
GRANT SELECT ON public.survey_responses TO anon;

-- 5) Public read policy for responses (of active surveys with public_results)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='survey_responses' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.survey_responses', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Public can view responses of public surveys" ON public.survey_responses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.surveys s WHERE s.id = survey_id AND s.active = true AND s.public_results = true)
  );
CREATE POLICY "Admins can view all responses" ON public.survey_responses
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'developer'::public.app_role));

-- 6) Update submit function
DROP FUNCTION IF EXISTS public.submit_survey_response(text, jsonb);

CREATE OR REPLACE FUNCTION public.submit_survey_response(
  _survey_id uuid,
  _name text,
  _answers jsonb,
  _privacy_consent boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE new_id uuid;
BEGIN
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'array' THEN
    RAISE EXCEPTION 'answers deve essere un array';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.surveys WHERE id = _survey_id AND active = true) THEN
    RAISE EXCEPTION 'Questionario non disponibile';
  END IF;
  INSERT INTO public.survey_responses (survey_id, respondent_name, answers, privacy_consent)
    VALUES (
      _survey_id,
      CASE WHEN COALESCE(_privacy_consent, false) THEN NULLIF(btrim(COALESCE(_name, '')), '') ELSE NULL END,
      _answers,
      COALESCE(_privacy_consent, false)
    )
    RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_survey_response(uuid, text, jsonb, boolean) TO anon, authenticated;
