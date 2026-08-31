import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMyAreas, type AreaRow } from "@/lib/api/areas.functions";
import { AREA_TAB_BY_PATH, areaColor, areaIconFor } from "@/lib/area-catalog";
import { setActiveArea, clearActiveArea } from "@/lib/active-area";

import { ChevronRight, Loader2 } from "lucide-react";
import { BackTile } from "@/components/BackHome";
import logoSogit from "@/assets/logo-sogit.jpg.asset.json";

export const Route = createFileRoute("/gestione/$areaId")({
  head: () => ({
    meta: [
      { title: "Macro area · Gestione S.O.G.IT." },
      { name: "description", content: "Schede e strumenti disponibili nella macro area selezionata di Gestione S.O.G.IT." },
      { property: "og:title", content: "Macro area · Gestione S.O.G.IT." },
      { property: "og:description", content: "Schede e strumenti disponibili nella macro area selezionata di Gestione S.O.G.IT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Macro area · Gestione S.O.G.IT." },
      { name: "twitter:description", content: "Schede e strumenti disponibili nella macro area selezionata di Gestione S.O.G.IT." },
    ],
  }),
  component: AreaPage,
});

function AreaPage() {
  const { areaId } = useParams({ from: "/gestione/$areaId" });
  const navigate = useNavigate();
  const fetchAreas = useServerFn(listMyAreas);
  const [area, setArea] = useState<AreaRow | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) { navigate({ to: "/auth", replace: true }); return; }
      try {
        const res = await fetchAreas();
        if (cancelled) return;
        const found = res.areas.find((a) => a.id === areaId) ?? null;
        setArea(found);
        if (found) {
          setActiveArea({ id: found.id, name: found.name, tabs: found.tabs });
          // Apre direttamente le schede dell'area (nessuna pagina intermedia)
          const first = found.tabs.includes("/dashboard") ? "/dashboard" : found.tabs[0];
          if (first) { navigate({ to: first, replace: true }); return; }
        } else clearActiveArea();
      } catch { /* nessuna area */ }
      if (!cancelled) setReady(true);

    })();
    return () => { cancelled = true; };
  }, [areaId]);

  const c = areaColor(area?.color);
  const AreaIcon = areaIconFor(area?.name ?? "", area?.tabs ?? []);

  return (
    <div className="relative min-h-screen app-surface overflow-hidden">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center">
        <img src={logoSogit.url} alt="" className="w-[min(90vw,720px)] opacity-[0.06] blur-[1px] select-none" />
        <div className="absolute inset-0 bg-linear-to-b from-background/60 via-background/30 to-background/80" />
      </div>

      <div className="relative z-10">
        <header className="page-header">
          <div className="container mx-auto px-4 py-4 flex items-center gap-3">
            <BackTile />
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 space-y-6">
          {!ready ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !area ? (
            <div className="editorial-card p-6">
              <h1 className="font-display text-xl">Area non disponibile</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Non hai accesso a questa macro area oppure è stata rimossa.
              </p>
            </div>
          ) : (
            <>
              <section className="flex items-start gap-3">
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${c.bg} ring-1 ${c.ring}`}>
                  <AreaIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="eyebrow">Macro area</p>
                  <h1 className="font-display text-2xl md:text-3xl tracking-tight">{area.name}</h1>
                  {area.description && <p className="mt-1 text-sm text-muted-foreground">{area.description}</p>}
                </div>
              </section>

              {area.tabs.length === 0 ? (
                <div className="editorial-card p-6 text-sm text-muted-foreground">Nessuna scheda in quest'area.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {area.tabs.map((p) => {
                    const t = AREA_TAB_BY_PATH.get(p);
                    if (!t) return null;
                    return (
                      <Link
                        key={p}
                        to={p}
                        className={`editorial-card flex items-center justify-between gap-3 p-5 ring-1 ${c.ring} hover:ring-2 hover:ring-primary/40 transition`}
                      >
                        <span className="min-w-0">
                          <span className="font-display text-lg leading-tight tracking-tight block">{t.label}</span>
                          <span className="block text-xs text-muted-foreground">{t.description}</span>
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
