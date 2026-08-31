import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyPermissions } from "@/lib/api/admin.functions";
import { supabase } from "@/integrations/supabase/client";

export type UserPermissions = {
  can_create_interventions: boolean;
  can_modify_own_interventions: boolean;
  can_view_others_interventions: boolean;
  can_manage_anagraphics: boolean;
  is_admin: boolean;
};

const FULL: UserPermissions = {
  can_create_interventions: true,
  can_modify_own_interventions: true,
  can_view_others_interventions: true,
  can_manage_anagraphics: true,
  is_admin: false,
};

export function usePermissions() {
  const [perms, setPerms] = useState<UserPermissions>(FULL);
  const [loaded, setLoaded] = useState(false);
  const fetchPerms = useServerFn(getMyPermissions);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: u } = await supabase.auth.getSession();
        if (!u.session) { setLoaded(true); return; }
        const res = await fetchPerms();
        if (!cancelled) setPerms(res as UserPermissions);
      } catch {/* fall back to full */ }
      finally { if (!cancelled) setLoaded(true); }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return { perms, loaded };
}
