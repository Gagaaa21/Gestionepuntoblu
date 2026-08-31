import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useHiddenRoutes } from "@/lib/hidden-routes";
import { toast } from "sonner";

/**
 * Componente invisibile: se la route corrente è stata nascosta dall'admin
 * programmatore, rimanda l'utente alla dashboard (a meno che non sia developer).
 */
export function RouteVisibilityGate({ path }: { path: string }) {
  const navigate = useNavigate();
  const { hidden, loaded } = useHiddenRoutes();
  const [isDev, setIsDev] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setIsDev(false); return; }
      const { data: roles } = await supabase
        .from("user_roles" as any).select("role").eq("user_id", data.user.id);
      if (cancelled) return;
      setIsDev(((roles as any) ?? []).some((r: any) => r.role === "developer"));
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded || isDev === null) return;
    if (hidden.has(path) && !isDev) {
      toast.info("Questa sezione è temporaneamente non disponibile.");
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loaded, isDev, hidden, path]);

  return null;
}
