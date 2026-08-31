DROP POLICY IF EXISTS "interventions_select_all_auth" ON public.interventions;
CREATE POLICY "interventions_select_permitted" ON public.interventions
FOR SELECT TO authenticated
USING (
  auth.uid() = created_by
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'developer'::public.app_role)
  OR public.has_permission(auth.uid(), 'can_view_others_interventions')
);

DROP POLICY IF EXISTS "patients_select_all_auth" ON public.patients;
CREATE POLICY "patients_select_permitted" ON public.patients
FOR SELECT TO authenticated
USING (
  auth.uid() = created_by
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'developer'::public.app_role)
  OR public.has_permission(auth.uid(), 'can_view_others_interventions')
  OR public.has_permission(auth.uid(), 'can_manage_anagraphics')
);