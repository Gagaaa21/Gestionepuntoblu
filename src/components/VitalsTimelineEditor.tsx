import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Heart, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type VitalEntry = {
  vs_pas: string;
  vs_pad: string;
  vs_fc: string;
  vs_fr: string;
  vs_spo2: string;
  vs_temp: string;
  vs_glicemia: string;
  /** Ora della misurazione (HH:MM). */
  at: string;
};

export const emptyVitalEntry = (): VitalEntry => ({
  vs_pas: "", vs_pad: "", vs_fc: "", vs_fr: "", vs_spo2: "", vs_temp: "", vs_glicemia: "", at: "",
});

/** Solo le colonne numeriche: l'ora viaggia a parte (colonna `at` del timeline JSON). */
export function vitalEntryToDb(e: VitalEntry) {
  const num = (s: string) => s.trim() === "" ? null : Number(s);
  const dec = (s: string) => s.trim() === "" ? null : Number(s.replace(",", "."));
  return {
    vs_pas: num(e.vs_pas), vs_pad: num(e.vs_pad), vs_fc: num(e.vs_fc), vs_fr: num(e.vs_fr),
    vs_spo2: num(e.vs_spo2), vs_temp: dec(e.vs_temp), vs_glicemia: num(e.vs_glicemia),
  };
}

export function vitalEntryFromDb(v: Record<string, any> | null | undefined): VitalEntry {
  const s = (n: any) => n == null ? "" : String(n);
  if (!v) return emptyVitalEntry();
  return {
    vs_pas: s(v.vs_pas), vs_pad: s(v.vs_pad), vs_fc: s(v.vs_fc), vs_fr: s(v.vs_fr),
    vs_spo2: s(v.vs_spo2), vs_temp: s(v.vs_temp), vs_glicemia: s(v.vs_glicemia),
    at: s(v.at),
  };
}


export function isVitalEntryEmpty(e: VitalEntry) {
  return (["vs_pas", "vs_pad", "vs_fc", "vs_fr", "vs_spo2", "vs_temp", "vs_glicemia"] as const)
    .every((k) => (e[k] ?? "").trim() === "");
}


/* ============================================================
   Anomaly detection — deterministica, in tempo reale
   Livelli:  ok | warn (attenzione) | alert (critico)
   ============================================================ */

export type Severity = "ok" | "warn" | "alert";

export type VitalFlag = { severity: Severity; label: string; hint: string };

function num(s: string): number | null {
  if (s == null) return null;
  const t = String(s).trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function classifyVital(field: keyof VitalEntry, raw: string): VitalFlag | null {
  const v = num(raw);
  if (v == null) return null;
  switch (field) {
    case "vs_pas":
      if (v >= 180) return { severity: "alert", label: "Ipertensione severa", hint: "PAS ≥ 180 mmHg — valutare urgenza" };
      if (v >= 160) return { severity: "warn", label: "Ipertensione", hint: "PAS 160–179 mmHg" };
      if (v <= 80) return { severity: "alert", label: "Ipotensione severa", hint: "PAS ≤ 80 mmHg — rischio shock" };
      if (v <= 95) return { severity: "warn", label: "Ipotensione", hint: "PAS 81–95 mmHg" };
      return { severity: "ok", label: "Normale", hint: "PAS nella norma" };
    case "vs_pad":
      if (v >= 120) return { severity: "alert", label: "Diastolica critica", hint: "PAD ≥ 120 mmHg" };
      if (v >= 100) return { severity: "warn", label: "Diastolica alta", hint: "PAD 100–119 mmHg" };
      if (v <= 45) return { severity: "alert", label: "Diastolica bassissima", hint: "PAD ≤ 45 mmHg" };
      if (v <= 55) return { severity: "warn", label: "Diastolica bassa", hint: "PAD 46–55 mmHg" };
      return { severity: "ok", label: "Normale", hint: "" };
    case "vs_fc":
      if (v >= 150) return { severity: "alert", label: "Tachicardia severa", hint: "FC ≥ 150 bpm" };
      if (v >= 120) return { severity: "warn", label: "Tachicardia", hint: "FC 120–149 bpm" };
      if (v <= 40) return { severity: "alert", label: "Bradicardia severa", hint: "FC ≤ 40 bpm" };
      if (v <= 50) return { severity: "warn", label: "Bradicardia", hint: "FC 41–50 bpm" };
      return { severity: "ok", label: "Normale", hint: "" };
    case "vs_fr":
      if (v >= 30) return { severity: "alert", label: "Tachipnea severa", hint: "FR ≥ 30/min" };
      if (v >= 22) return { severity: "warn", label: "Tachipnea", hint: "FR 22–29/min" };
      if (v <= 8) return { severity: "alert", label: "Bradipnea severa", hint: "FR ≤ 8/min" };
      if (v <= 10) return { severity: "warn", label: "Bradipnea", hint: "FR 9–10/min" };
      return { severity: "ok", label: "Normale", hint: "" };
    case "vs_spo2":
      if (v <= 88) return { severity: "alert", label: "Ipossia severa", hint: "SpO₂ ≤ 88% — ossigenoterapia" };
      if (v <= 93) return { severity: "warn", label: "Desaturazione", hint: "SpO₂ 89–93%" };
      return { severity: "ok", label: "Normale", hint: "" };
    case "vs_temp":
      if (v >= 39.5) return { severity: "alert", label: "Febbre elevata", hint: "T ≥ 39.5 °C" };
      if (v >= 38) return { severity: "warn", label: "Febbre", hint: "T 38–39.4 °C" };
      if (v <= 35) return { severity: "alert", label: "Ipotermia", hint: "T ≤ 35 °C" };
      if (v <= 35.9) return { severity: "warn", label: "Ipotermia lieve", hint: "T 35.1–35.9 °C" };
      return { severity: "ok", label: "Normale", hint: "" };
    case "vs_glicemia":
      if (v >= 300) return { severity: "alert", label: "Iperglicemia severa", hint: "Glic ≥ 300 mg/dL" };
      if (v >= 200) return { severity: "warn", label: "Iperglicemia", hint: "Glic 200–299 mg/dL" };
      if (v <= 54) return { severity: "alert", label: "Ipoglicemia severa", hint: "Glic ≤ 54 mg/dL" };
      if (v <= 70) return { severity: "warn", label: "Ipoglicemia", hint: "Glic 55–70 mg/dL" };
      return { severity: "ok", label: "Normale", hint: "" };
    default:
      return null;
  }
}


const severityRing: Record<Severity, string> = {
  ok: "border-emerald-500/40 focus-visible:ring-emerald-500/40",
  warn: "border-amber-500/70 focus-visible:ring-amber-500/40 bg-amber-500/5",
  alert: "border-red-600/70 focus-visible:ring-red-600/40 bg-red-600/5",
};

const severityText: Record<Severity, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  alert: "text-red-600 dark:text-red-400",
};

function FieldWithFlag({
  label, field, value, onChange, step,
}: {
  label: string;
  field: keyof VitalEntry;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  const flag = classifyVital(field, value);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        className={cn(flag && flag.severity !== "ok" && severityRing[flag.severity])}
      />
      {flag && flag.severity !== "ok" && (
        <div className={cn("flex items-center gap-1 text-[11px] leading-tight", severityText[flag.severity])}>
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{flag.label}</span>
        </div>
      )}
    </div>
  );
}

export function collectVitalAlerts(entries: VitalEntry[]): Array<{ time: string; severity: Severity; label: string; hint: string; field: string }> {
  const fields: Array<[keyof VitalEntry, string]> = [
    ["vs_pas", "PAS"], ["vs_pad", "PAD"], ["vs_fc", "FC"], ["vs_fr", "FR"],
    ["vs_spo2", "SpO₂"], ["vs_temp", "T"], ["vs_glicemia", "Glic"],
  ];
  const out: Array<{ time: string; severity: Severity; label: string; hint: string; field: string }> = [];
  entries.forEach((e, idx) => {
    for (const [f, name] of fields) {
      const flag = classifyVital(f, e[f]);
      if (flag && flag.severity !== "ok") {
        out.push({ time: e.at ? `T${idx + 1} (${e.at})` : `T${idx + 1}`, severity: flag.severity, label: flag.label, hint: flag.hint, field: name });
      }
    }
  });
  return out;
}

type Props = {
  entries: VitalEntry[];
  onChange: (entries: VitalEntry[]) => void;
  /** When true, shows a compact label-only inputs (used inside edit dialogs). */
  compact?: boolean;
};

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function VitalsTimelineEditor({ entries, onChange, compact = false }: Props) {
  const update = (idx: number, patch: Partial<VitalEntry>) => {
    onChange(entries.map((e, i) => i === idx ? { ...e, ...patch } : e));
  };
  const remove = (idx: number) => onChange(entries.filter((_, i) => i !== idx));
  const add = () => onChange([...entries, { ...emptyVitalEntry(), at: nowHHMM() }]);

  const alerts = collectVitalAlerts(entries);
  const hasAlert = alerts.some((a) => a.severity === "alert");
  const hasWarn = alerts.some((a) => a.severity === "warn");

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center gap-2 text-sm font-medium">
          <Heart className="h-4 w-4 text-primary" /> Parametri vitali (facoltativi)
        </div>
      )}
      {entries.map((e, idx) => (
        <div key={idx} className="rounded-xl border border-border/60 bg-card/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                Tempo T{idx + 1}
              </span>
              <input
                type="time"
                value={e.at}
                onChange={(ev) => update(idx, { at: ev.target.value })}
                aria-label={`Ora rilevazione T${idx + 1}`}
                className="h-7 rounded-md border border-border/70 bg-background px-2 text-xs tabular-nums"
              />
              {!e.at && (
                <button
                  type="button"
                  onClick={() => update(idx, { at: nowHHMM() })}
                  className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                >
                  Ora
                </button>
              )}
            </div>
            {entries.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)} className="h-7 text-xs text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
              </Button>

            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FieldWithFlag label="PAS (mmHg)" field="vs_pas" value={e.vs_pas} onChange={(v) => update(idx, { vs_pas: v })} />
            <FieldWithFlag label="PAD (mmHg)" field="vs_pad" value={e.vs_pad} onChange={(v) => update(idx, { vs_pad: v })} />
            <FieldWithFlag label="FC (bpm)" field="vs_fc" value={e.vs_fc} onChange={(v) => update(idx, { vs_fc: v })} />
            <FieldWithFlag label="FR (n/min)" field="vs_fr" value={e.vs_fr} onChange={(v) => update(idx, { vs_fr: v })} />
            <FieldWithFlag label="SpO₂ (%)" field="vs_spo2" value={e.vs_spo2} onChange={(v) => update(idx, { vs_spo2: v })} />
            <FieldWithFlag label="Temp (°C)" field="vs_temp" value={e.vs_temp} onChange={(v) => update(idx, { vs_temp: v })} step="0.1" />
            <FieldWithFlag label="Glicemia (mg/dL)" field="vs_glicemia" value={e.vs_glicemia} onChange={(v) => update(idx, { vs_glicemia: v })} />
          </div>
        </div>
      ))}

      {alerts.length > 0 && (
        <div
          className={cn(
            "rounded-xl border p-3 text-xs space-y-1",
            hasAlert
              ? "border-red-600/60 bg-red-600/5 text-red-700 dark:text-red-300"
              : hasWarn
              ? "border-amber-500/60 bg-amber-500/5 text-amber-700 dark:text-amber-300"
              : "border-border bg-muted/30",
          )}
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            {hasAlert ? "Parametri critici rilevati" : "Parametri da valutare"}
          </div>
          <ul className="space-y-0.5 pl-5 list-disc marker:text-current">
            {alerts.slice(0, 8).map((a, i) => (
              <li key={i}>
                <span className="font-medium">{a.time} · {a.field}</span> — {a.label}
                {a.hint && <span className="opacity-80"> ({a.hint})</span>}
              </li>
            ))}
          </ul>
          {hasAlert && (
            <div className="pt-1 opacity-90">
              Suggerimento: rivalutare il paziente e considerare invio in PPI se il quadro clinico lo richiede.
            </div>
          )}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4 mr-1" /> Aggiungi misurazione (T{entries.length + 1})
      </Button>
    </div>
  );
}
