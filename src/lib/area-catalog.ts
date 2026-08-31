// Catalogo delle "schede" assegnabili alle macro aree (Gestione SOGIT).
export type AreaTab = { path: string; label: string; description: string };

export const AREA_TABS: AreaTab[] = [
  { path: "/dashboard", label: "Archivio clinico", description: "Registrazione interventi e cartelle" },
  { path: "/search", label: "Cerca pazienti", description: "Cartelle cliniche" },
  { path: "/report", label: "Resoconto", description: "Report giornaliero PDF" },
  { path: "/stats", label: "Statistiche", description: "Andamento e grafici" },
  { path: "/checklist", label: "Check list", description: "Controlli quotidiani" },
  { path: "/reports", label: "Segnalazioni", description: "Problemi segnalati" },
  { path: "/procedures", label: "Procedure", description: "Protocolli operativi" },
  { path: "/guide", label: "Guida", description: "Manuale d'uso" },
  { path: "/previsioni", label: "Previsioni", description: "Meteo e affluenza" },
  { path: "/office", label: "Prestazioni ufficio", description: "Servizi di segreteria" },
  { path: "/trasporti-secondari", label: "Trasporti secondari", description: "Ospedalieri, ADI, infermiere" },
  { path: "/servizi-sportivi", label: "Servizi sportivi", description: "Eventi e mezzi" },
  { path: "/questionario", label: "Questionari", description: "Gestione questionari e QR" },
  { path: "/admin", label: "Utenti", description: "Gestione utenti e permessi" },
];

export const AREA_TAB_BY_PATH = new Map(AREA_TABS.map((t) => [t.path, t]));

export const AREA_COLORS: { value: string; label: string; dot: string; ring: string; bg: string }[] = [
  { value: "navy", label: "Navy", dot: "bg-primary", ring: "ring-primary/30", bg: "bg-primary/10" },
  { value: "rosso", label: "Rosso", dot: "bg-rose-600", ring: "ring-rose-500/30", bg: "bg-rose-500/10" },
  { value: "ambra", label: "Ambra", dot: "bg-amber-500", ring: "ring-amber-500/30", bg: "bg-amber-500/10" },
  { value: "verde", label: "Verde", dot: "bg-emerald-600", ring: "ring-emerald-500/30", bg: "bg-emerald-500/10" },
  { value: "azzurro", label: "Azzurro", dot: "bg-sky-600", ring: "ring-sky-500/30", bg: "bg-sky-500/10" },
  { value: "viola", label: "Viola", dot: "bg-violet-600", ring: "ring-violet-500/30", bg: "bg-violet-500/10" },
];

export const areaColor = (v: string | null | undefined) =>
  AREA_COLORS.find((c) => c.value === v) ?? AREA_COLORS[0];

// --- Icone automatiche per macro area (in base al nome / alle schede) ---
import {
  Layers, Stethoscope, Truck, Trophy, Briefcase, ClipboardList,
  Shield, Sun, BookOpen, LifeBuoy, type LucideIcon,
} from "lucide-react";

const NAME_RULES: { re: RegExp; icon: LucideIcon }[] = [
  { re: /punto blu|clinic|sanitar|soccors|emergenz/i, icon: Stethoscope },
  { re: /trasport/i, icon: Truck },
  { re: /sport/i, icon: Trophy },
  { re: /uffici|segreteri|amministra/i, icon: Briefcase },
  { re: /question|sondagg|feedback/i, icon: ClipboardList },
  { re: /sicurezz|admin|utent/i, icon: Shield },
  { re: /meteo|prevision/i, icon: Sun },
  { re: /guida|formazion|procedur/i, icon: BookOpen },
];

const TAB_ICONS: Record<string, LucideIcon> = {
  "/dashboard": Stethoscope,
  "/search": Stethoscope,
  "/trasporti-secondari": Truck,
  "/servizi-sportivi": Trophy,
  "/office": Briefcase,
  "/questionario": ClipboardList,
  "/admin": Shield,
  "/previsioni": Sun,
  "/procedures": BookOpen,
  "/guide": BookOpen,
  "/checklist": LifeBuoy,
};

/** Sceglie automaticamente un'icona coerente con il contenuto dell'area. */
export function areaIconFor(name: string, tabs: string[] = []): LucideIcon {
  for (const r of NAME_RULES) if (r.re.test(name)) return r.icon;
  for (const t of tabs) { const i = TAB_ICONS[t]; if (i) return i; }
  return Layers;
}
