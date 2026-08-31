import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Home } from "lucide-react";
import { getActiveArea, clearActiveArea, type ActiveArea } from "@/lib/active-area";

/**
 * Ritorno contestuale. La home del gestionale è sempre "Gestione S.O.G.IT.":
 * dentro un'area che include la dashboard Punto Blu il primo passo torna alla
 * dashboard, altrimenti si rientra direttamente in Gestione SOGIT.
 */
export function useBackHome() {
  const [area, setArea] = useState<ActiveArea | null>(null);
  useEffect(() => { setArea(getActiveArea()); }, []);
  const toGestione = !area || !area.tabs.includes("/dashboard");
  return toGestione
    ? { to: "/gestione" as const, label: "Gestione S.O.G.IT.", hint: area?.name ?? "Home", isHome: true }
    : { to: "/dashboard" as const, label: "Punto Blu", hint: area?.name ?? null, isHome: false };
}

function BackPill({ compact }: { compact?: boolean }) {
  const { to, label, hint, isHome } = useBackHome();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        to={to}
        className="back-pill min-w-0"
        onClick={() => { if (isHome) clearActiveArea(); }}
        aria-label={`Torna a ${label}`}
      >
        <span className="back-pill-icon"><ArrowLeft className="h-4 w-4" /></span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate">{label}</span>
          {!compact && hint && (
            <span className="block text-[10px] font-normal uppercase tracking-[0.14em] text-muted-foreground truncate">
              {hint}
            </span>
          )}
        </span>
      </Link>

      {!isHome && (
        <Link
          to="/gestione"
          onClick={() => clearActiveArea()}
          aria-label="Torna alla home Gestione S.O.G.IT."
          title="Home · Gestione S.O.G.IT."
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-card/80 text-muted-foreground shadow-sm transition hover:bg-primary/10 hover:text-primary"
        >
          <Home className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

export function BackButton() {
  return <BackPill compact />;
}

export function BackTile() {
  return <BackPill />;
}
