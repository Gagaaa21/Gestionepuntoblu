CREATE OR REPLACE FUNCTION public.list_job_titles()
RETURNS TABLE(username text, job_title text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.username, p.job_title
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.list_job_titles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_job_titles() TO authenticated;