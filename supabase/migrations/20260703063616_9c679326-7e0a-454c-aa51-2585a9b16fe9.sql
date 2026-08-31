
-- Aggiorna list_active_sessions: admin OR developer, errore chiaro
CREATE OR REPLACE FUNCTION public.list_active_sessions()
 RETURNS TABLE(session_id uuid, user_id uuid, username text, full_name text, created_at timestamptz, updated_at timestamptz, not_after timestamptz, user_agent text, ip inet)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public','auth'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non autorizzato: sessione mancante' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Non autorizzato: richiesto ruolo admin o developer' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.id, s.user_id, p.username, p.full_name,
           s.created_at, s.updated_at, s.not_after,
           s.user_agent, s.ip
      FROM auth.sessions s
      LEFT JOIN public.profiles p ON p.id = s.user_id
     WHERE (s.not_after IS NULL OR s.not_after > now())
     ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_active_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_sessions() TO authenticated;

-- Revoca UNA sessione specifica
CREATE OR REPLACE FUNCTION public.admin_revoke_session(_session_id uuid)
 RETURNS TABLE(revoked_count integer, target_user uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','auth'
AS $$
DECLARE v_user uuid; v_cnt integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non autorizzato: sessione mancante' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Non autorizzato: richiesto ruolo admin o developer' USING ERRCODE = '42501';
  END IF;
  SELECT s.user_id INTO v_user FROM auth.sessions s WHERE s.id = _session_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessione non trovata' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM auth.refresh_tokens WHERE session_id = _session_id;
  DELETE FROM auth.sessions WHERE id = _session_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  -- Forza invalidazione JWT lato client
  UPDATE public.profiles SET force_logout_at = now() WHERE id = v_user;
  INSERT INTO public.audit_log(actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), 'SESSION_REVOKED', 'auth', _session_id::text,
          jsonb_build_object('target_user', v_user, 'revoked', v_cnt));
  RETURN QUERY SELECT v_cnt, v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_session(uuid) TO authenticated;

-- Revoca TUTTE le sessioni di un utente
CREATE OR REPLACE FUNCTION public.admin_revoke_all_user_sessions(_user_id uuid)
 RETURNS TABLE(revoked_sessions integer, revoked_refresh_tokens integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','auth'
AS $$
DECLARE v_sess integer; v_rt integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non autorizzato: sessione mancante' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Non autorizzato: richiesto ruolo admin o developer' USING ERRCODE = '42501';
  END IF;
  DELETE FROM auth.refresh_tokens WHERE user_id = (
    SELECT email FROM auth.users WHERE id = _user_id
  );
  GET DIAGNOSTICS v_rt = ROW_COUNT;
  DELETE FROM auth.refresh_tokens
   WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id = _user_id);
  DELETE FROM auth.sessions WHERE user_id = _user_id;
  GET DIAGNOSTICS v_sess = ROW_COUNT;
  UPDATE public.profiles SET force_logout_at = now() WHERE id = _user_id;
  INSERT INTO public.audit_log(actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), 'USER_FORCE_LOGOUT', 'auth', _user_id::text,
          jsonb_build_object('revoked_sessions', v_sess, 'revoked_refresh_tokens', v_rt));
  RETURN QUERY SELECT v_sess, v_rt;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_all_user_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_all_user_sessions(uuid) TO authenticated;
