import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Activity, AlertTriangle, ArrowUpRight, Calendar, MapPin, Send, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

type Vitalsish = {
  vs_pas?: number | null; vs_pad?: number | null; vs_fc?: number | null;
  vs_spo2?: number | null; vs_temp?: number | null; vs_glicemia?: number | null;
};

export type QuickIntervention = Vitalsish & {
  id: string;
  patient_id?: string | null;
  intervention_type: string;
  intervention_date: string;
  invio_in_ppi?: boolean | null;
  fuori_sede?: boolean | null;
  notes?: string | null;
  operator_username?: string | null;
};

const CRIT: Array<{ key: keyof Vitalsish; label: string; unit?: string; bad: (v: number) => boolean }> = [
  { key: "vs_fc", label: "FC", bad: (v) => v >= 130 || v <= 45 },
  { key: "vs_spo2", label: "SpO₂", unit: "%", bad: (v) => v <= 92 },
  { key: "vs_temp", label: "T", unit: "°", bad: (v) => v >= 38.5 || v <= 35 },
  { key: "vs_glicemia", label: "Glic", bad: (v) => v >= 300 || v <= 55 },
];

function VitalChip({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        bad ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border/70 bg-card text-foreground/80",
      )}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {value}
    </span>
  );
}

/** Anteprima immediata dello storico di un paziente già in archivio. */
export function PatientQuickHistory({
  patientId,
  patientName,
  interventions,
  limit = 5,
}: {
  patientId: string;
  patientName: string;
  interventions: QuickIntervention[];
  limit?: number;
}) {
  const hist = interventions
    .filter((i) => i.patient_id === patientId)
    .sort((a, b) => (b.intervention_date ?? "").localeCompare(a.intervention_date ?? ""));
  if (hist.length === 0) return null;
  const shown = hist.slice(0, limit);

  return (
    <div className="rounded-2xl border border-primary/20 bg-card/70 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow">Storico immediato</p>
          <p className="truncate text-sm font-semibold">{patientName}</p>
        </div>
        <Link
          to="/search"
          search={{ patient: patientId }}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
        >
          Cartella completa <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <ol className="space-y-2">
        {shown.map((i) => {
          const pasBad = i.vs_pas != null && (i.vs_pas >= 180 || i.vs_pas <= 90);
          const padBad = i.vs_pad != null && (i.vs_pad >= 110 || i.vs_pad <= 55);
          const chips = CRIT.flatMap((c) => {
            const v = i[c.key];
            if (v == null) return [];
            return [<VitalChip key={c.label} label={c.label} value={`${v}${c.unit ?? ""}`} bad={c.bad(Number(v))} />];
          });
          return (
            <li key={i.id} className="rounded-xl border border-border/60 bg-background/70 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 truncate text-sm font-medium">{i.intervention_type}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(i.intervention_date), "dd MMM yyyy · HH:mm", { locale: it })}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {(i.vs_pas != null || i.vs_pad != null) && (
                  <VitalChip label="PA" value={`${i.vs_pas ?? "-"}/${i.vs_pad ?? "-"}`} bad={pasBad || padBad} />
                )}
                {chips}
                {i.invio_in_ppi && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                    <Send className="h-3 w-3" /> PPI
                  </span>
                )}
                {i.fuori_sede && (
                  <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3" /> Fuori sede
                  </span>
                )}
                {chips.length === 0 && i.vs_pas == null && i.vs_pad == null && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Activity className="h-3 w-3" /> Nessun parametro registrato
                  </span>
                )}
              </div>
              {i.notes && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="line-clamp-2">{i.notes}</span>
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {hist.length > shown.length && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3" /> Altri {hist.length - shown.length} interventi nella cartella completa.
        </p>
      )}
    </div>
  );
}
