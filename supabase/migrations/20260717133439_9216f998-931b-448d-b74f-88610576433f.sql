
CREATE TABLE public.survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position int NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('rating','single','multi','text','yesno')),
  label text NOT NULL,
  options jsonb,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.survey_questions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.survey_questions TO authenticated;
GRANT ALL ON public.survey_questions TO service_role;
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "survey_questions_select_active_public" ON public.survey_questions
  FOR SELECT TO anon USING (active = true);
CREATE POLICY "survey_questions_select_all_auth" ON public.survey_questions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "survey_questions_admin_insert" ON public.survey_questions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "survey_questions_admin_update" ON public.survey_questions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "survey_questions_admin_delete" ON public.survey_questions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER survey_questions_touch BEFORE UPDATE ON public.survey_questions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  respondent_name text,
  answers jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.survey_responses TO anon, authenticated;
GRANT SELECT, DELETE ON public.survey_responses TO authenticated;
GRANT ALL ON public.survey_responses TO service_role;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "survey_responses_public_insert" ON public.survey_responses
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "survey_responses_admin_select" ON public.survey_responses
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "survey_responses_admin_delete" ON public.survey_responses
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Trigger: notify all admins on new response
CREATE OR REPLACE FUNCTION public.notify_admins_new_survey_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles WHERE role = 'admin'::public.app_role LOOP
    INSERT INTO public.notifications(user_id, title, body, kind, link)
    VALUES (
      r.user_id,
      'Nuova risposta al questionario',
      COALESCE('da ' || NULLIF(trim(NEW.respondent_name), ''), 'Risposta anonima ricevuta'),
      'info',
      '/questionario'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER survey_responses_notify_admins
AFTER INSERT ON public.survey_responses
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_survey_response();
