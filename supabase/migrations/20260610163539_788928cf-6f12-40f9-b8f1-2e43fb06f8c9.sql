ALTER TABLE public.patients REPLICA IDENTITY FULL;
ALTER TABLE public.interventions REPLICA IDENTITY FULL;
ALTER TABLE public.intervention_types REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_items REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_checks REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_completions REPLICA IDENTITY FULL;
ALTER TABLE public.reports REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.patients; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.interventions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.intervention_types; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_checks; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_completions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.reports; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;