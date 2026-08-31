ALTER TABLE public.secondary_transports
  ADD COLUMN IF NOT EXISTS adi_route_id uuid REFERENCES public.transport_adi_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

CREATE INDEX IF NOT EXISTS secondary_transports_needs_review_idx
  ON public.secondary_transports (needs_review, transport_date DESC);
CREATE INDEX IF NOT EXISTS secondary_transports_adi_route_idx
  ON public.secondary_transports (adi_route_id)
  WHERE adi_route_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_username text;
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_entity_id text;
  v_changed_fields jsonb := '[]'::jsonb;
BEGIN
  SELECT username INTO v_username FROM public.profiles WHERE id = v_actor;
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_row := COALESCE(v_new, v_old, '{}'::jsonb);
  v_entity_id := COALESCE(
    v_row->>'id', v_row->>'key', v_row->>'path', v_row->>'slug',
    v_row->>'user_id', v_row->>'area_id', v_row->>'username_lower', ''
  );

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb)
      INTO v_changed_fields
      FROM jsonb_each(v_new)
     WHERE (v_old->key) IS DISTINCT FROM (v_new->key)
       AND key NOT IN ('updated_at');
  ELSIF TG_OP = 'INSERT' THEN
    SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb)
      INTO v_changed_fields
      FROM jsonb_object_keys(v_new) AS key
     WHERE key NOT IN ('created_at', 'updated_at');
  END IF;

  INSERT INTO public.audit_log(actor_id, actor_username, action, entity, entity_id, details)
  VALUES (
    v_actor,
    v_username,
    TG_OP,
    TG_TABLE_NAME,
    NULLIF(v_entity_id, ''),
    jsonb_build_object('changed_fields', v_changed_fields)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_settings', 'area_members', 'areas',
    'checklist_checks', 'checklist_completions', 'checklist_items',
    'hidden_routes', 'intervention_types', 'interventions', 'inventory_items',
    'notification_prefs', 'notifications', 'office_service_types', 'office_services',
    'operator_checkins', 'patients', 'procedures', 'profiles', 'reports',
    'secondary_transports', 'site_customizations', 'sport_service_files',
    'sport_services', 'sport_vehicles', 'survey_questions', 'survey_responses',
    'surveys', 'transport_adi_routes', 'transport_hospitals',
    'transport_intra_tariffs', 'transport_tariffs', 'user_favorites',
    'user_permissions', 'user_roles'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()',
        t, t
      );
    END IF;
  END LOOP;
END $$;