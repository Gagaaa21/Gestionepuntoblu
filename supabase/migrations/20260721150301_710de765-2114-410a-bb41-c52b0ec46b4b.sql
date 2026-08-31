CREATE OR REPLACE FUNCTION public.cron_auto_force_logout_rome()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  t text := to_char((now() AT TIME ZONE 'Europe/Rome'), 'HH24:MI');
  v_sess integer := 0;
  v_rt integer := 0;
BEGIN
  IF t IN ('00:01','14:10') THEN
    -- Segna tutti i profili per invalidazione JWT client-side
    UPDATE public.profiles SET force_logout_at = now();

    -- Revoca tutte le sessioni e refresh token lato server
    DELETE FROM auth.refresh_tokens;
    GET DIAGNOSTICS v_rt = ROW_COUNT;
    DELETE FROM auth.sessions;
    GET DIAGNOSTICS v_sess = ROW_COUNT;

    INSERT INTO public.audit_log(actor_id, action, entity, details)
      VALUES (NULL, 'DAILY_FORCE_LOGOUT', 'auth',
              jsonb_build_object('rome_time', t, 'stamp', now(),
                                 'revoked_sessions', v_sess,
                                 'revoked_refresh_tokens', v_rt));
  END IF;
END;
$function$;