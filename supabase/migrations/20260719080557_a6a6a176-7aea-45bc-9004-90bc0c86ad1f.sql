CREATE OR REPLACE FUNCTION public.submit_survey_response(_name text, _answers jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id uuid;
BEGIN
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'array' THEN
    RAISE EXCEPTION 'answers deve essere un array';
  END IF;
  INSERT INTO public.survey_responses (respondent_name, answers)
    VALUES (NULLIF(btrim(COALESCE(_name, '')), ''), _answers)
    RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_survey_response(text, jsonb) TO anon, authenticated;