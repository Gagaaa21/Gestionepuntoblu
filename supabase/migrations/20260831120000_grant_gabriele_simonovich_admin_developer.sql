-- Concede il livello di permessi massimo all'utente "Gabriele.Simonovich":
--   - ruolo 'admin'      -> gestione utenti, aree, permessi
--   - ruolo 'developer'  -> il livello più alto: accesso a /security,
--                           visibilità automatica di TUTTE le macro aree
--                           (anche senza essere assegnato via area_members),
--                           bypassa le route nascoste (hidden_routes)
--   - permessi granulari -> tutti i can_* attivi, incluse le sezioni
--                           "Trasporti secondari" e "Servizi sportivi" che
--                           richiedono un flag esplicito anche per un admin
--
-- Idempotente: può essere rieseguita senza effetti collaterali.
-- Se l'utente non esiste ancora in public.profiles (deve prima registrarsi
-- o essere creato dal pannello Admin -> Utenti), la migration non fallisce:
-- stampa solo un avviso e non applica nulla.

DO $$
DECLARE
  target_id uuid;
BEGIN
  SELECT id INTO target_id
  FROM public.profiles
  WHERE username ILIKE 'Gabriele.Simonovich'
  LIMIT 1;

  IF target_id IS NULL THEN
    RAISE NOTICE 'Utente "Gabriele.Simonovich" non trovato in public.profiles: nessuna modifica applicata. Crealo prima (registrazione o pannello Admin -> Utenti), poi rilancia questa migration oppure esegui questo blocco manualmente dallo SQL editor di Supabase.';
    RETURN;
  END IF;

  -- Ruoli
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_id, 'admin'), (target_id, 'developer')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Permessi granulari (tabella creata con record di default per ogni
  -- utente esistente: qui forziamo comunque tutti i flag a true)
  INSERT INTO public.user_permissions (
    user_id, can_create_interventions, can_modify_own_interventions,
    can_view_others_interventions, can_manage_anagraphics,
    can_manage_transports, can_manage_sport
  )
  VALUES (target_id, true, true, true, true, true, true)
  ON CONFLICT (user_id) DO UPDATE SET
    can_create_interventions = true,
    can_modify_own_interventions = true,
    can_view_others_interventions = true,
    can_manage_anagraphics = true,
    can_manage_transports = true,
    can_manage_sport = true,
    updated_at = now();

  -- Rimuove eventuale sospensione residua sull'account
  UPDATE public.profiles
  SET suspended_at = NULL, suspended_until = NULL, suspended_reason = NULL, suspended_by = NULL
  WHERE id = target_id;

  RAISE NOTICE 'Ruoli admin+developer e permessi completi concessi a % (Gabriele.Simonovich)', target_id;
END $$;
