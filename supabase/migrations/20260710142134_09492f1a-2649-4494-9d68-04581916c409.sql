
DROP POLICY IF EXISTS inventory_insert_auth ON public.inventory_items;
DROP POLICY IF EXISTS inventory_update_auth ON public.inventory_items;

CREATE POLICY inventory_insert_admin ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY inventory_update_admin ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
