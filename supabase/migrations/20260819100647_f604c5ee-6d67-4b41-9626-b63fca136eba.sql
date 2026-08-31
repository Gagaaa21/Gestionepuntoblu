CREATE POLICY app_settings_block_suspended
ON public.app_settings
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (NOT public.is_suspended(auth.uid()))
WITH CHECK (NOT public.is_suspended(auth.uid()));

CREATE POLICY site_customizations_block_suspended
ON public.site_customizations
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (NOT public.is_suspended(auth.uid()))
WITH CHECK (NOT public.is_suspended(auth.uid()));

CREATE POLICY surveys_block_suspended
ON public.surveys
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (NOT public.is_suspended(auth.uid()))
WITH CHECK (NOT public.is_suspended(auth.uid()));

CREATE POLICY survey_questions_block_suspended
ON public.survey_questions
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (NOT public.is_suspended(auth.uid()))
WITH CHECK (NOT public.is_suspended(auth.uid()));

CREATE POLICY survey_responses_block_suspended
ON public.survey_responses
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (NOT public.is_suspended(auth.uid()))
WITH CHECK (NOT public.is_suspended(auth.uid()));

CREATE POLICY hidden_routes_block_suspended
ON public.hidden_routes
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (NOT public.is_suspended(auth.uid()))
WITH CHECK (NOT public.is_suspended(auth.uid()));

CREATE POLICY profiles_block_suspended_update
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (NOT public.is_suspended(auth.uid()))
WITH CHECK (NOT public.is_suspended(auth.uid()));