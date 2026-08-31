
CREATE POLICY "procedure_media_select_auth" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'procedure-media');
CREATE POLICY "procedure_media_insert_admin" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'procedure-media' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "procedure_media_update_admin" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'procedure-media' AND public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (bucket_id = 'procedure-media' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "procedure_media_delete_admin" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'procedure-media' AND public.has_role(auth.uid(), 'admin'::public.app_role));
