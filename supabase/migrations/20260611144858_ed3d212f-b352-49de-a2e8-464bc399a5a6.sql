DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.reports;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;