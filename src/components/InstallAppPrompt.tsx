import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Share } from "lucide-react";

const DISMISS_KEY = "pwa_install_dismissed_at";

/** Registra il service worker e propone l'installazione dell'app. */
export function InstallAppPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const recentlyDismissed = Date.now() - dismissed < 1000 * 60 * 60 * 24 * 14;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (standalone || recentlyDismissed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt as any);

    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    if (isIos) {
      setIosHint(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt as any);
  }, []);

  if (!visible) return null;

  const close = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* noop */ }
    setDeferred(null);
    close();
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur md:left-auto md:right-4 md:mx-0">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Download className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Installa Gestione S.O.G.IT.</p>
          {iosHint ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Su iPhone tocca <Share className="inline h-3 w-3" /> Condividi e poi “Aggiungi a Home”.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Aggiungila alla schermata principale: si apre come una vera app, a schermo intero.
            </p>
          )}
          {!iosHint && (
            <Button size="sm" className="mt-2" onClick={install}>
              Installa app
            </Button>
          )}
        </div>
        <button type="button" onClick={close} aria-label="Chiudi" className="rounded p-1 text-muted-foreground hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
