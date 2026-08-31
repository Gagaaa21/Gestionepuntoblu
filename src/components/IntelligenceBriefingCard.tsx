import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { dailyBriefing, type IntelligenceBriefing } from "@/lib/api/intelligence.functions";
import { isAiUnavailable, aiMessage, isAiPausedClient, pauseAiClient } from "@/lib/ai-guard";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, Lightbulb, RefreshCw, UserCircle } from "lucide-react";

const CACHE_KEY = "intelligenceBriefing:v1";

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Il briefing viene generato automaticamente una sola volta al giorno. */
function readCache(): IntelligenceBriefing | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IntelligenceBriefing;
    if (dayKey(new Date(parsed.generated_at)) !== dayKey(new Date())) return null;
    return parsed;
  } catch { return null; }
}

export function IntelligenceBriefingCard() {
  const run = useServerFn(dailyBriefing);
  const [data, setData] = useState<IntelligenceBriefing | null>(() => (typeof window !== "undefined" ? readCache() : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soft, setSoft] = useState(false);

  const load = useCallback(async (force = false) => {
    if (loading) return;
    if (!force && data) return;
    setLoading(true);
    setError(null);
    try {
      const res = await run();
      setData(res);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(res)); } catch { /* ignore */ }
    } catch (e) {
      if (isAiUnavailable(e)) {
        pauseAiClient();
        setSoft(true);
        setError(aiMessage(e));
      } else {
        setSoft(false);
        setError(e instanceof Error ? e.message : "Errore imprevisto.");
      }
    } finally {
      setLoading(false);
    }
  }, [run, data, loading]);

  useEffect(() => {
    if (data) return;
    if (isAiPausedClient()) {
      setSoft(true);
      setError("Briefing intelligente in pausa: tutti gli altri dati restano disponibili.");
      return;
    }
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const TrendIcon = (data?.prediction.trend_pct ?? 0) >= 0 ? TrendingUp : TrendingDown;
  const trendColor = (data?.prediction.trend_pct ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600";

  return (
    <section className="editorial-card p-5 md:p-6 space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="eyebrow">Briefing intelligente</p>
            <h2 className="font-display text-xl md:text-2xl tracking-tight leading-tight">
              {loading && !data ? "Sto analizzando i dati…" : data?.headline ?? "Panoramica del giorno"}
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Aggiorna
        </button>
      </header>

      {error && (
        <div className={soft
          ? "rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          : "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"}>
          {error}
        </div>
      )}

      {!data && loading && (
        <div className="grid gap-3 md:grid-cols-3">
          {[0,1,2].map((k) => <div key={k} className="h-24 rounded-xl bg-muted/40 animate-pulse" />)}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {/* Previsione */}
            <div className="rounded-xl border bg-card p-4">
              <p className="eyebrow">Previsione oggi</p>
              <div className="mt-1 flex items-end gap-2">
                <p className="font-display text-3xl tracking-tight">{data.prediction.expected_today}</p>
                <p className="text-xs text-muted-foreground pb-1">interventi attesi</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Banda: {data.prediction.band_low}–{data.prediction.band_high}
              </p>
              <div className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${trendColor}`}>
                <TrendIcon className="h-3.5 w-3.5" />
                {data.prediction.trend_pct >= 0 ? "+" : ""}{data.prediction.trend_pct}% vs 2 sett.
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground italic">{data.prediction.driver}</p>
            </div>

            {/* Highlights */}
            <div className="rounded-xl border bg-card p-4">
              <p className="eyebrow flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5" /> Osservazioni</p>
              {data.highlights.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nessuna osservazione rilevante.</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {data.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2"><span className="text-primary">·</span><span>{h}</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Anomalie */}
          {data.anomalies.length > 0 && (
            <div className="space-y-2">
              <p className="eyebrow flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Anomalie rilevate</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.anomalies.map((a, i) => {
                  const tone = a.severity === "alert"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : a.severity === "warn"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-sky-200 bg-sky-50 text-sky-800";
                  return (
                    <li key={i} className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>{a.text}</li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Pazienti da seguire */}
          {data.patient_flags.length > 0 && (
            <div className="space-y-2">
              <p className="eyebrow">Pazienti da tenere d'occhio</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.patient_flags.map((f) => (
                  <li key={f.patient_id}>
                    <Link
                      to="/search"
                      search={{ patient: f.patient_id }}
                      className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2 hover:ring-2 hover:ring-primary/30 transition"
                    >
                      <UserCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{f.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{f.reason}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground italic">
            Generato con AI su dati aggregati • {new Date(data.generated_at).toLocaleString("it-IT")}
          </p>
        </>
      )}
    </section>
  );
}
