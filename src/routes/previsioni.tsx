import { BackButton } from "@/components/BackHome";
import { PageHeader } from "@/components/PageHeader";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getForecast } from "@/lib/api/forecast.functions";
import type { ForecastResponse, PresenceLevel } from "@/lib/api/forecast.types";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, RefreshCw, Loader2, Sparkles, Sun, Cloud, CloudRain, CloudSnow,
  CloudLightning, CloudFog, CloudDrizzle, Wind, Droplets, Thermometer, MapPin,
} from "lucide-react";

export const Route = createFileRoute("/previsioni")({
  head: () => ({
    meta: [
      { title: "Previsioni · Meteo e presenze a Lignano" },
      { name: "description", content: "Previsioni meteo settimanali e stima AI dell'affluenza a Lignano Sabbiadoro." },
      { property: "og:url", content: "https://your-domain.example/previsioni" },
      { property: "og:title", content: "Previsioni · Meteo e presenze a Lignano" },
      { property: "og:description", content: "Previsioni meteo settimanali e stima AI dell'affluenza a Lignano Sabbiadoro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Previsioni · Meteo e presenze a Lignano" },
      { name: "twitter:description", content: "Previsioni meteo settimanali e stima AI dell'affluenza a Lignano Sabbiadoro." },
    ],
    links: [{ rel: "canonical", href: "https://your-domain.example/previsioni" }],
  }),
  component: PrevisioniPage,
});

const LEVEL_LABEL = ["Bassa", "Media", "Alta", "Molto alta"] as const;
const LEVEL_COLOR = ["#22c55e", "#eab308", "#f97316", "#ef4444"] as const;

function weatherIcon(code: number) {
  // WMO weather codes
  const cls = "h-8 w-8";
  if (code === 0) return <Sun className={cls} style={{ color: "#f59e0b" }} />;
  if ([1, 2].includes(code)) return <Sun className={cls} style={{ color: "#f59e0b", opacity: 0.85 }} />;
  if (code === 3) return <Cloud className={cls} style={{ color: "#64748b" }} />;
  if ([45, 48].includes(code)) return <CloudFog className={cls} style={{ color: "#94a3b8" }} />;
  if ([51, 53, 55, 56, 57].includes(code)) return <CloudDrizzle className={cls} style={{ color: "#3b82f6" }} />;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return <CloudRain className={cls} style={{ color: "#2563eb" }} />;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return <CloudSnow className={cls} style={{ color: "#0ea5e9" }} />;
  if ([95, 96, 99].includes(code)) return <CloudLightning className={cls} style={{ color: "#a855f7" }} />;
  return <Cloud className={cls} style={{ color: "#64748b" }} />;
}

function weatherLabel(code: number): string {
  if (code === 0) return "Sereno";
  if ([1, 2].includes(code)) return "Poco nuvoloso";
  if (code === 3) return "Coperto";
  if ([45, 48].includes(code)) return "Nebbia";
  if ([51, 53, 55, 56, 57].includes(code)) return "Pioviggine";
  if ([61, 63, 80, 81].includes(code)) return "Pioggia";
  if ([65, 82].includes(code)) return "Pioggia forte";
  if ([66, 67].includes(code)) return "Pioggia gelata";
  if ([71, 73, 75, 85, 86].includes(code)) return "Neve";
  if (code === 77) return "Granuli di neve";
  if ([95, 96, 99].includes(code)) return "Temporale";
  return "—";
}

function formatDay(iso: string): { d: string; m: string } {
  const dt = new Date(iso + "T12:00:00");
  return {
    d: String(dt.getDate()).padStart(2, "0"),
    m: dt.toLocaleDateString("it-IT", { month: "short" }).replace(".", ""),
  };
}

function PresenceBar({ level }: { level: PresenceLevel }) {
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-2 flex-1 rounded-full transition-all"
            style={{
              backgroundColor: i <= level ? LEVEL_COLOR[level] : "color-mix(in oklab, var(--border) 90%, transparent)",
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <span className="font-medium" style={{ color: LEVEL_COLOR[level] }}>
          {LEVEL_LABEL[level]}
        </span>
        <span className="text-muted-foreground">affluenza</span>
      </div>
    </div>
  );
}

function PrevisioniPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<ForecastResponse | null>(null);
  const runFn = useServerFn(getForecast);

  const REFRESH_MS = 10 * 60 * 1000; // 10 minuti

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate({ to: "/auth" });
    });
  }, [navigate]);

  const load = async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await runFn();
      dataRef.current = res;
      setData(res);
    } catch (e) {
      if (dataRef.current) setError(null);
      else setError(e instanceof Error ? e.message : "Errore nel caricamento delle previsioni.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load({ silent: true });
    }, REFRESH_MS);
    const onVis = () => {
      const current = dataRef.current;
      if (document.visibilityState === "visible" && current) {
        const age = Date.now() - new Date(current.updatedAt).getTime();
        if (age > REFRESH_MS) load({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={<MapPin className="h-5 w-5" />}
        eyebrow="Lignano Sabbiadoro · 7 giorni"
        title="Previsioni"
        subtitle="Meteo e affluenza stimata"
        actions={
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading || refreshing}>
            {loading || refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1 hidden sm:inline">Aggiorna</span>
          </Button>
        }
      />

      <main className="container mx-auto px-4 py-5 space-y-5">
        {/* AI summary */}
        <section className="section-card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="icon-chip"><Sparkles className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base leading-tight tracking-tight">Riepilogo AI</h2>
              {loading && !data && (
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisi meteo e stima presenze in corso…
                </p>
              )}
              {error && <p className="text-sm text-destructive mt-1">{error}</p>}
              {data && (
                <p className="text-sm leading-relaxed mt-1">{data.summary}</p>
              )}
            </div>
          </div>
        </section>

        {/* Legend */}
        <section className="section-card p-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Livelli di affluenza
          </div>
          <div className="flex flex-wrap gap-3">
            {LEVEL_LABEL.map((label, i) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <span className="inline-block h-3 w-6 rounded-full" style={{ backgroundColor: LEVEL_COLOR[i] }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Days grid */}
        {loading && !data && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="section-card h-44 animate-pulse bg-muted/30" />
            ))}
          </div>
        )}

        {data && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.days.map((day, idx) => {
              const dt = formatDay(day.date);
              const today = idx === 0;
              return (
                <article
                  key={day.date}
                  className="section-card p-4 relative overflow-hidden"
                  style={{
                    borderColor: today
                      ? `color-mix(in oklab, ${LEVEL_COLOR[day.presence]} 45%, var(--border))`
                      : undefined,
                  }}
                >
                  {/* colored accent stripe on top */}
                  <span
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: LEVEL_COLOR[day.presence] }}
                  />

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {day.weekday}{today && " · Oggi"}
                      </div>
                      <div className="font-display text-2xl leading-none mt-0.5">
                        {dt.d} <span className="text-base text-muted-foreground">{dt.m}</span>
                      </div>
                    </div>
                    <div className="shrink-0">{weatherIcon(day.weatherCode)}</div>
                  </div>

                  <div className="mt-3 text-sm text-muted-foreground">{weatherLabel(day.weatherCode)}</div>

                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <span className="flex items-center gap-1">
                      <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                      <strong>{day.tMax}°</strong>
                      <span className="text-muted-foreground">/{day.tMin}°</span>
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Droplets className="h-3.5 w-3.5" />
                      {day.precipProb}%
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Wind className="h-3.5 w-3.5" />
                      {day.windMax}
                    </span>
                  </div>

                  <PresenceBar level={day.presence} />

                  {day.presenceReason && (
                    <p className="mt-2 text-xs text-muted-foreground leading-snug">
                      {day.presenceReason}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {data && (
          <section className="section-card p-4">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Fonti
            </div>
            <ul className="text-sm space-y-1">
              {data.sources.map((s) => (
                <li key={s} className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Aggiornato: {new Date(data.updatedAt).toLocaleString("it-IT")}. La stima delle presenze è
              un'approssimazione basata su meteo, giorno della settimana e stagionalità: non sono dati reali di
              traffico o prenotazioni.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
