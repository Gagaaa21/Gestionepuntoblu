CREATE POLICY "block_suspended" ON public.user_permissions AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_suspended(auth.uid())) WITH CHECK (NOT public.is_suspended(auth.uid()));

CREATE POLICY "block_suspended" ON public.user_roles AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_suspended(auth.uid())) WITH CHECK (NOT public.is_suspended(auth.uid()));