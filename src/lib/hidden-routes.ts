import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Tutte le schede/funzioni nascondibili (tutte tranne Dashboard).
// Le voci "feature:*" non sono route ma micro-funzionalità (bell, ecc.).
export const HIDEABLE_ROUTES: { path: string; label: string }[] = [
  { path: "/search", label: "Cerca pazienti" },
  { path: "/report", label: "Resoconto" },
  { path: "/stats", label: "Statistiche" },
  { path: "/checklist", label: "Check list" },
  { path: "/reports", label: "Segnalazioni" },
  { path: "/guide", label: "Guida" },
  { path: "/procedures", label: "Procedure" },
  { path: "/previsioni", label: "Previsioni" },
  { path: "/office", label: "Prestazioni ufficio" },
  { path: "/questionario", label: "Questionario" },
  { path: "/admin", label: "Utenti" },
  { path: "/privacy", label: "Privacy" },
  { path: "feature:notifications", label: "Campanella notifiche" },
];

export function useHiddenRoutes() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const { data } = await supabase.rpc("list_hidden_route_paths" as any);
    setHidden(new Set(((data as any) ?? []).map((r: any) => r.path)));
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc("list_hidden_route_paths" as any);
      if (cancelled) return;
      setHidden(new Set(((data as any) ?? []).map((r: any) => r.path)));
      setLoaded(true);
    };
    load();
    const ch = supabase
      .channel("hidden-routes-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "hidden_routes" }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  return { hidden, loaded, refetch };
}

export function useRouteGuard(path: string, isDeveloper: boolean, onBlocked: () => void) {
  const { hidden, loaded } = useHiddenRoutes();
  useEffect(() => {
    if (!loaded) return;
    if (hidden.has(path) && !isDeveloper) onBlocked();
  }, [loaded, hidden, path, isDeveloper]);
}
