-- Restrict direct SELECT on hidden_routes to admin/developer only
DROP POLICY IF EXISTS "Authenticated can read hidden_routes" ON public.hidden_routes;
DROP POLICY IF EXISTS "hidden_routes_select_all_auth" ON public.hidden_routes;
DROP POLICY IF EXISTS "hidden_routes select authenticated" ON public.hidden_routes;

CREATE POLICY "hidden_routes_select_admin_dev"
  ON public.hidden_routes
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'developer'::public.app_role)
  );

-- Expose only the list of hidden paths (no actor/timestamp metadata) to all authenticated users
CREATE OR REPLACE FUNCTION public.list_hidden_route_paths()
RETURNS TABLE(path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hr.path FROM public.hidden_routes hr
$$;

REVOKE ALL ON FUNCTION public.list_hidden_route_paths() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_hidden_route_paths() TO authenticated;