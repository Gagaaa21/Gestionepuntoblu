
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS privacy_text text,
  ADD COLUMN IF NOT EXISTS privacy_required boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.submit_survey_response(_survey_id uuid, _name text, _answers jsonb, _privacy_consent boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
  v_privacy_required boolean;
BEGIN
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'array' THEN
    RAISE EXCEPTION 'answers deve essere un array';
  END IF;
  SELECT privacy_required INTO v_privacy_required
    FROM public.surveys
    WHERE id = _survey_id AND active = true;
  IF v_privacy_required IS NULL THEN
    RAISE EXCEPTION 'Questionario non disponibile';
  END IF;
  IF v_privacy_required AND NOT COALESCE(_privacy_consent, false) THEN
    RAISE EXCEPTION 'Consenso privacy obbligatorio';
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
$function$;
