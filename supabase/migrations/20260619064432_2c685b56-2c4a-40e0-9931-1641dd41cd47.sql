-- Abilita realtime per la tabella hidden_routes (necessario perché la UI
-- aggiorni gli switch in tempo reale dopo i toggle del developer).
ALTER TABLE public.hidden_routes REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hidden_routes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.hidden_routes';
  END IF;
END $$;