import { RouteVisibilityGate } from "@/components/RouteVisibilityGate";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackHome";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, FileDown, ClipboardList, Activity, MapPin, Hospital, Heart, CalendarDays } from "lucide-react";
import { generateDailyReport } from "@/lib/pdf-report";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { formatOperator } from "@/lib/format-operator";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Resoconto giornaliero · Archivio clinico Punto Blu" },
      { name: "description", content: "Resoconto periodico delle attività: interventi, giornate di apertura e indicatori chiave." },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app/report" },
      { property: "og:title", content: "Resoconto giornaliero · Archivio clinico Punto Blu" },
      { property: "og:description", content: "Resoconto periodico delle attività: interventi, giornate di apertura e indicatori chiave." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Resoconto giornaliero · Archivio clinico Punto Blu" },
      { name: "twitter:description", content: "Resoconto periodico delle attività: interventi, giornate di apertura e indicatori chiave." },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app/report" }],
  }),
  component: ReportPage,
});

type Patient = { id: string; first_name: string; last_name: string };
type Intervention = {
  id: string; patient_id: string | null; intervention_type: string;
  intervention_date: string; invio_in_ppi: boolean; fuori_sede: boolean;
  notes: string | null; operator_username: string | null;
  vs_pas: number | null; vs_pad: number | null; vs_fc: number | null;
  vs_fr: number | null; vs_spo2: number | null;
  vs_temp: number | null; vs_glicemia: number | null;
};

const todayRome = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function vitalsLabel(i: Intervention) {
  const parts: string[] = [];
  if (i.vs_pas != null || i.vs_pad != null) parts.push(`PA ${i.vs_pas ?? "-"}/${i.vs_pad ?? "-"} mmHg`);
  if (i.vs_fc != null) parts.push(`FC ${i.vs_fc} bpm`);
  if (i.vs_fr != null) parts.push(`FR ${i.vs_fr}/min`);
  if (i.vs_spo2 != null) parts.push(`SpO₂ ${i.vs_spo2}%`);
  if (i.vs_temp != null) parts.push(`T ${i.vs_temp}°C`);
  if (i.vs_glicemia != null) parts.push(`Glic ${i.vs_glicemia} mg/dL`);
  return parts.join(" · ");
}

function ReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [date, setDate] = useState(todayRome());

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { navigate({ to: "/auth" }); return; }
      const [{ data: pts }, { data: ints }] = await Promise.all([
        supabase.from("patients" as any).select("*"),
        supabase.from("interventions" as any).select("*").order("intervention_date", { ascending: true }),
      ]);
      setPatients((pts as any) ?? []);
      setInterventions((ints as any) ?? []);
      setLoading(false);
    })();
  }, []);

  const daily = useMemo(() => {
    return interventions.filter((i) => {
      const dRome = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(i.intervention_date));
      return dRome === date;
    });
  }, [interventions, date]);

  const romeDay = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

  const totalDaysOpen = useMemo(() => {
    const s = new Set<string>();
    for (const i of interventions) if (i.intervention_date) s.add(romeDay(i.intervention_date));
    return s.size;
  }, [interventions]);

  const stats = useMemo(() => {
    const ppi = daily.filter((i) => i.invio_in_ppi).length;
    const fuori = daily.filter((i) => i.fuori_sede).length;
    const withVitals = daily.filter((i) => i.vs_pas != null || i.vs_fc != null || i.vs_spo2 != null).length;
    const byOp = new Map<string, number>();
    const byType = new Map<string, number>();
    for (const i of daily) {
      const op = i.operator_username || "Sconosciuto";
      byOp.set(op, (byOp.get(op) ?? 0) + 1);
      byType.set(i.intervention_type, (byType.get(i.intervention_type) ?? 0) + 1);
    }
    return {
      ppi, fuori, withVitals,
      byOp: [...byOp.entries()].sort((a, b) => b[1] - a[1]),
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [daily]);


  const download = () => {
    if (daily.length === 0) return toast.error("Nessun intervento per la data selezionata");
    generateDailyReport(date, daily as any, patients);
  };

  const prettyDate = (() => {
    const s = format(new Date(date + "T00:00:00"), "EEEE d MMMM yyyy", { locale: it });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Caricamento…</div>;

  return (
    <div className="min-h-screen app-surface"><RouteVisibilityGate path="/report" />
      <PageHeader
        icon={<ClipboardList className="h-5 w-5" />}
        eyebrow="Punto Blu"
        title="Resoconto giornaliero"
        subtitle="Riepilogo interventi e PDF"
      />

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8"
          style={{ boxShadow: "var(--shadow-elegant)" }}
        >
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, var(--primary-soft), transparent 70%)" }} />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <FileDown className="h-3.5 w-3.5" /> Riepilogo di giornata
              </div>
              <h2 className="mt-3 font-display text-2xl sm:text-3xl">{prettyDate}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {daily.length === 0 ? "Nessun intervento registrato in questa giornata."
                  : `${daily.length} intervent${daily.length === 1 ? "o" : "i"} · scarica il PDF per l'archiviazione.`}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
              </div>
              <Button onClick={download} disabled={daily.length === 0} className="shadow-sm">
                <FileDown className="h-4 w-4 mr-1.5" /> Scarica PDF
              </Button>
            </div>
          </div>
        </section>

        {/* KPI */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={<Activity className="h-4 w-4" />} label="Totale" value={daily.length} />
          <StatCard icon={<Hospital className="h-4 w-4" />} label="Invii in PPI" value={stats.ppi} />
          <StatCard icon={<MapPin className="h-4 w-4" />} label="Fuori sede" value={stats.fuori} />
          <StatCard icon={<Heart className="h-4 w-4" />} label="Con parametri vitali" value={stats.withVitals} />
          <StatCard icon={<CalendarDays className="h-4 w-4" />} label="Giorni di apertura" value={totalDaysOpen} />
        </section>


        {/* Breakdown */}
        <section className="grid lg:grid-cols-2 gap-6">
          <Card style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader><CardTitle className="font-display text-lg">Per evento</CardTitle></CardHeader>
            <CardContent>
              {stats.byType.length === 0 ? <p className="text-sm text-muted-foreground">Nessun dato</p> : (
                <ul className="space-y-2">
                  {stats.byType.map(([t, n]) => (
                    <li key={t} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                      <span className="truncate">{t}</span>
                      <span className="font-semibold tabular-nums text-primary">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader><CardTitle className="font-display text-lg">Per operatore</CardTitle></CardHeader>
            <CardContent>
              {stats.byOp.length === 0 ? <p className="text-sm text-muted-foreground">Nessun dato</p> : (
                <ul className="space-y-2">
                  {stats.byOp.map(([o, n]) => (
                    <li key={o} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                      <span className="truncate">{o === "Sconosciuto" ? o : formatOperator(o)}</span>
                      <span className="font-semibold tabular-nums text-primary">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Detail table */}
        <Card style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader>
            <CardTitle className="font-display text-lg">Dettaglio interventi</CardTitle>
            <CardDescription>Elenco cronologico della giornata selezionata.</CardDescription>
          </CardHeader>
          <CardContent>
            {daily.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-secondary/20 py-10 text-center text-sm text-muted-foreground">
                Nessun intervento in questa data.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Ora</TableHead>
                      <TableHead>Paziente</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Operatore</TableHead>
                      <TableHead>PPI</TableHead>
                      <TableHead>Fuori</TableHead>
                      <TableHead>Parametri</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {daily.map((i) => {
                      const p = i.patient_id ? patients.find((x) => x.id === i.patient_id) : null;
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium tabular-nums">{format(new Date(i.intervention_date), "HH:mm")}</TableCell>
                          <TableCell>{p ? `${p.last_name} ${p.first_name}` : <span className="italic text-muted-foreground">Sconosciuto</span>}</TableCell>
                          <TableCell>{i.intervention_type}</TableCell>
                          <TableCell>{formatOperator(i.operator_username)}</TableCell>
                          <TableCell>{i.invio_in_ppi ? "Sì" : "—"}</TableCell>
                          <TableCell>{i.fuori_sede ? "Sì" : "—"}</TableCell>
                          <TableCell className="text-xs">{vitalsLabel(i) || "—"}</TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{i.notes ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      </div>
      <div className="mt-2 font-display text-3xl tabular-nums">{value}</div>
    </div>
  );
}
