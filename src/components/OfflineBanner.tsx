import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, CloudUpload } from "lucide-react";
import { flushQueue, pendingCount, subscribe } from "@/lib/offline-queue";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setPending(pendingCount());
    const unsub = subscribe(() => setPending(pendingCount()));

    let cancelled = false;
    // Active reachability check — navigator.onLine is unreliable (especially in iframes/previews)
    async function probe() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!cancelled) setOnline(false);
        return;
      }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        await fetch("https://www.gstatic.com/generate_204", { method: "GET", mode: "no-cors", cache: "no-store", signal: ctrl.signal });
        clearTimeout(t);
        if (!cancelled) { setOnline(true); doFlush(); }
      } catch {
        if (!cancelled) setOnline(false);
      }
    }
    probe();
    const interval = setInterval(probe, 15000);

    const goOn = () => { probe(); };
    const goOff = () => setOnline(false);
    window.addEventListener("online", goOn);
    window.addEventListener("offline", goOff);
    return () => {
      cancelled = true;
      clearInterval(interval);
      unsub();
      window.removeEventListener("online", goOn);
      window.removeEventListener("offline", goOff);
    };
  }, []);

  async function doFlush() {
    if (syncing) return;
    setSyncing(true);
    try { await flushQueue(); } finally { setSyncing(false); setPending(pendingCount()); }
  }

  if (online && pending === 0) return null;

  return (
    <div className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 px-3">
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur",
          !online
            ? "border-amber-300 bg-amber-50/95 text-amber-900"
            : "border-blue-300 bg-blue-50/95 text-blue-900"
        )}
        role="status"
        aria-live="polite"
      >
        {!online ? (
          <>
            <CloudOff className="h-3.5 w-3.5" />
            <span>Offline — i nuovi dati verranno inviati appena torna la rete</span>
            {pending > 0 && <span className="rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[10px]">{pending} in attesa</span>}
          </>
        ) : (
          <>
            {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
            <span>{syncing ? "Sincronizzazione in corso…" : `${pending} dato${pending === 1 ? "" : "i"} in attesa di sincronizzazione`}</span>
            {!syncing && (
              <button onClick={doFlush} className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90">
                Sincronizza ora
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
