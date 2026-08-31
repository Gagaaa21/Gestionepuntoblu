CREATE POLICY "block_suspended_office_service_types"
  ON public.office_service_types
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (NOT public.is_suspended(auth.uid()))
  WITH CHECK (NOT public.is_suspended(auth.uid()));

CREATE POLICY "block_suspended_secondary_transports"
  ON public.secondary_transports
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (NOT public.is_suspended(auth.uid()))
  WITH CHECK (NOT public.is_suspended(auth.uid()));