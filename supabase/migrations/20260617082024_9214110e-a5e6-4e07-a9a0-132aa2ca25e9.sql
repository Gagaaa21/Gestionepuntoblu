DROP POLICY IF EXISTS os_insert_office ON public.office_services;
CREATE POLICY os_insert_office ON public.office_services
  FOR INSERT TO authenticated
  WITH CHECK (public.has_office_access(auth.uid()));