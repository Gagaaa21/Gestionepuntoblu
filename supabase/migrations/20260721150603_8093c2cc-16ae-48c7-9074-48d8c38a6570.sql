-- 1) Suspended-user block via RESTRICTIVE policies (AND-ed with all others)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patients','interventions','reports','office_services','inventory_items','notifications'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS block_suspended ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY block_suspended ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_suspended(auth.uid())) WITH CHECK (NOT public.is_suspended(auth.uid()))',
      t
    );
  END LOOP;
END $$;

-- 2) Explicit public INSERT policy on survey_responses, tightly scoped
DROP POLICY IF EXISTS survey_responses_public_insert ON public.survey_responses;
CREATE POLICY survey_responses_public_insert
  ON public.survey_responses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_responses.survey_id
        AND s.active = true
        AND (NOT s.privacy_required OR survey_responses.privacy_consent = true)
    )
    AND (
      privacy_consent = true
      OR respondent_name IS NULL
    )
  );

GRANT INSERT ON public.survey_responses TO anon, authenticated;