
-- Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS guide_seen BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phone_prompted BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing users should not see the guide / phone prompt
UPDATE public.profiles SET guide_seen = TRUE, phone_prompted = TRUE WHERE created_at < now();

-- Allow admins to update any profile (for phone management)
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- app_settings table for the user guide content
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select_auth" ON public.app_settings;
CREATE POLICY "app_settings_select_auth" ON public.app_settings
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
CREATE POLICY "app_settings_admin_write" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default guide
INSERT INTO public.app_settings (key, value) VALUES (
  'user_guide',
  E'# Benvenuto nell''Archivio Clinico\n\nQuesta guida ti aiuta a usare l''applicazione.\n\n## Dashboard\n- **Registra un intervento**: inserisci nome e cognome del paziente, scegli l''evento dal menu a tendina e compila eventuali parametri vitali. Premi **Salva** per aggiungere l''intervento.\n- Se il paziente non esiste verrà creato automaticamente.\n- Puoi spuntare **Invio in PPI** o **Fuori sede** quando serve.\n\n## Checklist\n- Apri la sezione **Checklist** per spuntare i controlli giornalieri.\n- Le modifiche vengono salvate in tempo reale.\n\n## Resoconti\n- Nella sezione **Resoconti** puoi vedere e scaricare in PDF il resoconto giornaliero degli interventi.\n\n## Statistiche e Ricerca\n- **Statistiche**: visualizza grafici e numeri sugli interventi.\n- **Ricerca**: cerca un paziente o un intervento specifico.\n\n## Profilo\n- Puoi aggiornare il tuo numero di cellulare in qualsiasi momento dal tuo profilo (icona utente in alto a destra).\n\n## In caso di dubbi\nContatta un amministratore.'
) ON CONFLICT (key) DO NOTHING;
