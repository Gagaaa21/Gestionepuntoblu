
-- ============================================================
-- 1) FIX SICUREZZA: phone column - blocca update self via Data API
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_phone_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role (server fn updateOwnPhone)
    ELSIF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Modifica telefono non autorizzata via Data API';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_phone_self_update_trg ON public.profiles;
CREATE TRIGGER prevent_phone_self_update_trg
BEFORE UPDATE OF phone ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_phone_self_update();

-- ============================================================
-- 2) SOSPENSIONE UTENTI
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Blocca modifica dei campi suspended_* a chi non è admin/developer
CREATE OR REPLACE FUNCTION public.prevent_suspension_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.suspended_at IS DISTINCT FROM OLD.suspended_at)
     OR (NEW.suspended_until IS DISTINCT FROM OLD.suspended_until)
     OR (NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason)
     OR (NEW.suspended_by IS DISTINCT FROM OLD.suspended_by) THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    ELSIF public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'developer'::public.app_role) THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Non autorizzato a modificare lo stato di sospensione';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_suspension_self_update_trg ON public.profiles;
CREATE TRIGGER prevent_suspension_self_update_trg
BEFORE UPDATE OF suspended_at, suspended_until, suspended_reason, suspended_by
ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_suspension_self_update();

-- Helper: l'utente è sospeso (attivamente)?
CREATE OR REPLACE FUNCTION public.is_suspended(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _uid
      AND suspended_at IS NOT NULL
      AND (suspended_until IS NULL OR suspended_until > now())
  )
$$;

-- ============================================================
-- 3) PERMESSI GRANULARI per utente
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  can_create_interventions boolean NOT NULL DEFAULT true,
  can_modify_own_interventions boolean NOT NULL DEFAULT true,
  can_view_others_interventions boolean NOT NULL DEFAULT true,
  can_manage_anagraphics boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Ogni utente vede solo il proprio record; admin vede tutto
CREATE POLICY user_permissions_select_self_or_admin
ON public.user_permissions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY user_permissions_admin_write
ON public.user_permissions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.has_permission(_uid uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v boolean;
BEGIN
  -- Admin ha sempre tutti i permessi
  IF public.has_role(_uid, 'admin'::public.app_role) THEN RETURN true; END IF;
  EXECUTE format('SELECT COALESCE((SELECT %I FROM public.user_permissions WHERE user_id = $1), true)', _perm)
    INTO v USING _uid;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- Trigger updated_at
CREATE TRIGGER user_permissions_touch
BEFORE UPDATE ON public.user_permissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Crea record di default per utenti esistenti
INSERT INTO public.user_permissions (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 4) NOTIFICHE IN-APP
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  kind text NOT NULL DEFAULT 'info',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY notifications_update_own
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY notifications_delete_own
ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY notifications_admin_insert
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
ON public.notifications(user_id, read_at, created_at DESC);

-- ============================================================
-- 5) PREFERITI / NOTE PERSONALI
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity, entity_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_favorites TO authenticated;
GRANT ALL ON public.user_favorites TO service_role;

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_favorites_own
ON public.user_favorites FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS user_favorites_user_entity_idx
ON public.user_favorites(user_id, entity);
