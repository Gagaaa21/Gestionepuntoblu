import { useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { weeklyInsights } from "@/lib/api/ai.functions";
import { isAiUnavailable, aiMessage, isAiPausedClient, pauseAiClient } from "@/lib/ai-guard";

const CACHE_KEY = "weeklyInsights:v1";
const dayKey = () => new Date().toDateString();

function readDailyCache(): string[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { day: string; insights: string[] };
    return parsed.day === dayKey() ? parsed.insights : null;
  } catch { return null; }
}

export function WeeklyInsightsCard() {
  const [insights, setInsights] = useState<string[] | null>(() =>
    typeof window !== "undefined" ? readDailyCache() : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soft, setSoft] = useState(false);
  const runFn = useServerFn(weeklyInsights);

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const res = await runFn();
      setInsights(res.insights);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ day: dayKey(), insights: res.insights })); } catch { /* ignore */ }
    } catch (e) {
      if (isAiUnavailable(e)) {
        pauseAiClient();
        setSoft(true);
        setError(aiMessage(e));
      } else {
        setSoft(false);
        setError(e instanceof Error ? e.message : "Errore nella generazione degli insight.");
      }
    } finally {
      setLoading(false);
    }
  };

  const didRun = useRef(false);
  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    if (insights) return; // generato già oggi
    if (isAiPausedClient()) {
      setSoft(true);
      setError("Funzioni intelligenti in pausa: il resto della scheda funziona normalmente.");
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="section-card">
      <div className="section-header px-5 py-4 flex items-start gap-3">
        <div className="icon-chip"><Sparkles className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg leading-tight tracking-tight">Insight della settimana</h2>
            {insights && !loading && (
              <Button size="sm" variant="ghost" onClick={run}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Aggiorna
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Osservazioni generate dall'AI sugli ultimi 28 giorni di attività.
          </p>
        </div>
      </div>
      <div className="px-5 pb-5 pt-1">
        {!insights && !loading && !error && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground max-w-md">
              Un tap per farti riassumere pattern, picchi e cambi di tendenza sui dati di questo periodo.
            </p>
            <Button size="sm" variant="secondary" onClick={run}>
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Genera insight
            </Button>
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Analisi in corso…
          </div>
        )}
        {error && (
          <div className={soft
            ? "rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            : "text-sm text-destructive"}>
            {error}
            {soft && (
              <button type="button" onClick={run} className="ml-2 font-medium text-foreground underline underline-offset-2">
                Riprova
              </button>
            )}
          </div>
        )}
        {insights && insights.length > 0 && (
          <ul className="space-y-2">
            {insights.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
