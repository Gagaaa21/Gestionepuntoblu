
-- 1. profiles: restrict SELECT to self + admin/developer
DROP POLICY IF EXISTS profiles_select_all_auth ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- 2. survey_responses: remove public SELECT policy, tighten INSERT policy
DROP POLICY IF EXISTS "Public can view responses of public surveys" ON public.survey_responses;
DROP POLICY IF EXISTS survey_responses_public_insert ON public.survey_responses;
-- Direct inserts blocked: submissions must go through submit_survey_response() RPC (SECURITY DEFINER)

-- 3. Public RPC to fetch anonymized responses for a public survey
CREATE OR REPLACE FUNCTION public.get_public_survey_responses(_slug text)
RETURNS TABLE (
  id uuid,
  respondent_name text,
  privacy_consent boolean,
  answers jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_survey_id uuid; v_public boolean;
BEGIN
  SELECT s.id, s.public_results INTO v_survey_id, v_public
    FROM public.surveys s
    WHERE s.slug = _slug AND s.active = true;
  IF v_survey_id IS NULL OR NOT COALESCE(v_public, false) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT r.id,
           CASE WHEN r.privacy_consent THEN r.respondent_name ELSE NULL END AS respondent_name,
           r.privacy_consent,
           r.answers,
           r.created_at
      FROM public.survey_responses r
     WHERE r.survey_id = v_survey_id
     ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_survey_responses(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_survey_responses(text) TO anon, authenticated;

-- 4. Revoke anon EXECUTE from trigger-only definer function
REVOKE EXECUTE ON FUNCTION public.notify_admins_new_survey_response() FROM PUBLIC, anon;

-- 5. procedure-media storage: scope to non-suspended authenticated users
DROP POLICY IF EXISTS procedure_media_select_auth ON storage.objects;
CREATE POLICY procedure_media_select_auth ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'procedure-media'
    AND NOT public.is_suspended(auth.uid())
  );
