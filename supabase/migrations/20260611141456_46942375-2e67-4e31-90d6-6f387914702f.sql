DROP POLICY IF EXISTS "interventions_update_admin_or_owner" ON public.interventions;
CREATE POLICY "interventions_update_admin_or_owner" ON public.interventions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = created_by)
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = created_by);

DROP POLICY IF EXISTS "patients_update_admin_or_owner" ON public.patients;
CREATE POLICY "patients_update_admin_or_owner" ON public.patients
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = created_by)
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = created_by);