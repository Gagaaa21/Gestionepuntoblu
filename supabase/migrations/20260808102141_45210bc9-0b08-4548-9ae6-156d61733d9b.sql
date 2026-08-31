DROP POLICY IF EXISTS user_roles_insert_scoped ON public.user_roles;
DROP POLICY IF EXISTS user_roles_update_scoped ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete_scoped ON public.user_roles;

CREATE POLICY user_roles_insert_scoped ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  (role = 'developer'::app_role AND public.has_role(auth.uid(), 'developer'::app_role))
  OR (role = 'office'::app_role AND public.can_grant_office(auth.uid()))
  OR (role NOT IN ('developer'::app_role, 'office'::app_role) AND public.has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY user_roles_update_scoped ON public.user_roles FOR UPDATE TO authenticated
USING (
  (role = 'developer'::app_role AND public.has_role(auth.uid(), 'developer'::app_role))
  OR (role = 'office'::app_role AND public.can_grant_office(auth.uid()))
  OR (role NOT IN ('developer'::app_role, 'office'::app_role) AND public.has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  (role = 'developer'::app_role AND public.has_role(auth.uid(), 'developer'::app_role))
  OR (role = 'office'::app_role AND public.can_grant_office(auth.uid()))
  OR (role NOT IN ('developer'::app_role, 'office'::app_role) AND public.has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY user_roles_delete_scoped ON public.user_roles FOR DELETE TO authenticated
USING (
  (role = 'developer'::app_role AND public.has_role(auth.uid(), 'developer'::app_role))
  OR (role = 'office'::app_role AND public.can_grant_office(auth.uid()))
  OR (role NOT IN ('developer'::app_role, 'office'::app_role) AND public.has_role(auth.uid(), 'admin'::app_role))
);