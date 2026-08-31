
-- 1) reports: SELECT only owner or admin
DROP POLICY IF EXISTS "All authenticated can view reports" ON public.reports;
CREATE POLICY reports_select_owner_or_admin
  ON public.reports
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::app_role));

-- 2) user_roles: explicit admin-only INSERT/UPDATE/DELETE policies
CREATE POLICY user_roles_insert_admin
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY user_roles_update_admin
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY user_roles_delete_admin
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
