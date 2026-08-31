
-- Helper: is_developer
CREATE OR REPLACE FUNCTION public.is_developer(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'developer'::public.app_role)
$$;

-- ============= hidden_routes =============
CREATE TABLE public.hidden_routes (
  path text PRIMARY KEY,
  hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hidden_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hidden_routes TO authenticated;
GRANT ALL ON public.hidden_routes TO service_role;
ALTER TABLE public.hidden_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hidden_routes_select_auth" ON public.hidden_routes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "hidden_routes_dev_write" ON public.hidden_routes
  FOR ALL TO authenticated
  USING (public.is_developer(auth.uid()))
  WITH CHECK (public.is_developer(auth.uid()));

-- ============= auth_login_attempts =============
CREATE TABLE public.auth_login_attempts (
  username_lower text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_attempt timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_login_attempts TO service_role;
ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;
-- nessuna policy: accessibile solo via service role (server functions)

-- ============= audit_log =============
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_username text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX audit_log_entity_idx ON public.audit_log (entity, entity_id);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_select_dev" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_developer(auth.uid()));
-- no insert policy: only service role inserts (triggers run as definer)

-- Trigger function to log changes on sensitive tables
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_username text;
  v_entity_id text;
  v_details jsonb;
BEGIN
  SELECT username INTO v_username FROM public.profiles WHERE id = v_actor;
  IF (TG_OP = 'DELETE') THEN
    v_entity_id := COALESCE((to_jsonb(OLD)->>'id'), '');
    v_details := jsonb_build_object('old', to_jsonb(OLD));
  ELSIF (TG_OP = 'UPDATE') THEN
    v_entity_id := COALESCE((to_jsonb(NEW)->>'id'), '');
    v_details := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSE
    v_entity_id := COALESCE((to_jsonb(NEW)->>'id'), '');
    v_details := jsonb_build_object('new', to_jsonb(NEW));
  END IF;
  INSERT INTO public.audit_log(actor_id, actor_username, action, entity, entity_id, details)
  VALUES (v_actor, v_username, TG_OP, TG_TABLE_NAME, v_entity_id, v_details);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers to sensitive tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patients','interventions','profiles','user_roles','office_services','reports']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()', t, t);
  END LOOP;
END $$;
