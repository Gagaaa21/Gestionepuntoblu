CREATE POLICY "sport_files_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sport-files' AND public.has_sport_access(auth.uid()) AND NOT public.is_suspended(auth.uid()));
CREATE POLICY "sport_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sport-files' AND public.has_sport_access(auth.uid()) AND NOT public.is_suspended(auth.uid()));
CREATE POLICY "sport_files_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'sport-files' AND public.has_sport_access(auth.uid()) AND NOT public.is_suspended(auth.uid()))
  WITH CHECK (bucket_id = 'sport-files' AND public.has_sport_access(auth.uid()) AND NOT public.is_suspended(auth.uid()));
CREATE POLICY "sport_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sport-files' AND public.has_sport_access(auth.uid()) AND NOT public.is_suspended(auth.uid()));