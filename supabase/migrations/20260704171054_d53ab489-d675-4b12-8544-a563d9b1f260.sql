-- Cleanup pazienti creati con COGNOME iniziale (es. "M.R.", "Mario R.")
-- Sposta gli interventi come "Paziente Sconosciuto" (patient_id NULL) SENZA eliminarli, poi cancella la cartella.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.patients
    WHERE btrim(regexp_replace(last_name, '\.+$', '', 'g')) ~ '^[A-Za-zÀ-ÿ]$'
  LOOP
    UPDATE public.interventions SET patient_id = NULL WHERE patient_id = r.id;
    DELETE FROM public.patients WHERE id = r.id;
  END LOOP;
END $$;