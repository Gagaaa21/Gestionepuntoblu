import { FlaskConical, X } from "lucide-react";
import { useDemoMode } from "@/lib/demo-mode";

export function DemoModeBanner() {
  const { enabled, disable } = useDemoMode();
  if (!enabled) return null;

  return (
    <div className="sticky top-0 z-100 w-full border-b border-amber-500/40 bg-amber-500/15 backdrop-blur">
      <div className="container mx-auto flex items-center gap-3 px-4 py-2 text-xs sm:text-sm">
        <FlaskConical className="h-4 w-4 shrink-0 text-amber-600" />
        <p className="min-w-0 flex-1 leading-tight">
          <span className="font-semibold">Modalità prova attiva</span>
          <span className="text-muted-foreground"> · puoi provare tutto liberamente: nulla viene salvato nell'archivio reale.</span>
        </p>
        <button
          type="button"
          onClick={disable}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/50 px-2.5 py-1 font-medium hover:bg-amber-500/20"
        >
          <X className="h-3.5 w-3.5" /> Esci
        </button>
      </div>
    </div>
  );
}
