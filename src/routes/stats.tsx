import { RouteVisibilityGate } from "@/components/RouteVisibilityGate";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackHome";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, BarChart3, FileDown, TrendingUp, TrendingDown, Minus,
  CalendarDays, Users, Ambulance, MapPin, Activity,
} from "lucide-react";
import { format, differenceInCalendarDays, subDays, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { formatOperator } from "@/lib/format-operator";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, LineChart, Line, Legend,
} from "recharts";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Statistiche · Archivio clinico Punto Blu" },
      { name: "description", content: "Statistiche operative: andamento interventi, giornate di apertura e distribuzione delle attività." },
      { property: "og:url", content: "https://your-domain.example/stats" },
      { property: "og:title", content: "Statistiche · Archivio clinico Punto Blu" },
      { property: "og:description", content: "Statistiche operative: andamento interventi, giornate di apertura e distribuzione delle attività." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Statistiche · Archivio clinico Punto Blu" },
      { name: "twitter:description", content: "Statistiche operative: andamento interventi, giornate di apertura e distribuzione delle attività." },
    ],
    links: [{ rel: "canonical", href: "https://your-domain.example/stats" }],
  }),
  component: StatsPage,
});

type Intervention = {
  id: string; intervention_type: string; intervention_date: string;
  invio_in_ppi: boolean; fuori_sede: boolean; operator_username: string | null;
};

const romeDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

function StatsPage() {
  const navigate = useNavigate();
  const [all, setAll] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [opFilter, setOpFilter] = useState<string>("__all");
  const [typeFilter, setTypeFilter] = useState<string>("__all");
  const [ppiFilter, setPpiFilter] = useState<string>("__all");
  const [fuoriFilter, setFuoriFilter] = useState<string>("__all");

  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) { navigate({ to: "/auth" }); return; }
      const { data } = await supabase.from("interventions" as any).select("*").order("intervention_date", { ascending: false });
      setAll((data as any) ?? []);
      setLoading(false);
    })();
  }, []);

  const passesNonDate = (i: Intervention) => {
    if (opFilter !== "__all" && (i.operator_username ?? "") !== opFilter) return false;
    if (typeFilter !== "__all" && i.intervention_type !== typeFilter) return false;
    if (ppiFilter === "yes" && !i.invio_in_ppi) return false;
    if (ppiFilter === "no" && i.invio_in_ppi) return false;
    if (fuoriFilter === "yes" && !i.fuori_sede) return false;
    if (fuoriFilter === "no" && i.fuori_sede) return false;
    return true;
  };

  const interventions = useMemo(() => {
    return all.filter((i) => {
      const d = new Date(i.intervention_date);
      if (from && d < new Date(from + "T00:00:00")) return false;
      if (to && d > new Date(to + "T23:59:59")) return false;
      return passesNonDate(i);
    });
  }, [all, from, to, opFilter, typeFilter, ppiFilter, fuoriFilter]);

  // Previous-period comparison (same length window immediately before)
  const previousPeriodInterventions = useMemo(() => {
    if (interventions.length === 0) return [] as Intervention[];
    const dates = interventions.map((i) => new Date(i.intervention_date).getTime());
    const minTs = Math.min(...dates);
    const maxTs = Math.max(...dates);
    const span = Math.max(1, maxTs - minTs);
    const prevMax = minTs - 1;
    const prevMin = prevMax - span;
    return all.filter((i) => {
      const t = new Date(i.intervention_date).getTime();
      if (t < prevMin || t > prevMax) return false;
      return passesNonDate(i);
    });
  }, [all, interventions, opFilter, typeFilter, ppiFilter, fuoriFilter]);

  const operators = useMemo(() => Array.from(new Set(all.map((i) => i.operator_username || "Sconosciuto"))).sort(), [all]);
  const allTypes = useMemo(() => Array.from(new Set(all.map((i) => i.intervention_type))).sort(), [all]);

  const stats = useMemo(() => {
    const total = interventions.length;
    const byMonth = new Map<string, number>();
    const byDay = new Map<string, number>();
    const byType = new Map<string, number>();
    const byOperator = new Map<string, number>();
    const byWeekday = new Array(7).fill(0) as number[];
    const openDays = new Set<string>();
    let ppiCount = 0, fuoriCount = 0;
    let minDate: Date | null = null; let maxDate: Date | null = null;
    for (const i of interventions) {
      const d = new Date(i.intervention_date);
      const dayKey = romeDay(d);
      byMonth.set(format(d, "yyyy-MM"), (byMonth.get(format(d, "yyyy-MM")) ?? 0) + 1);
      byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
      byType.set(i.intervention_type, (byType.get(i.intervention_type) ?? 0) + 1);
      const op = i.operator_username || "Sconosciuto";
      byOperator.set(op, (byOperator.get(op) ?? 0) + 1);
      byWeekday[(d.getDay() + 6) % 7] += 1; // Monday-first
      openDays.add(dayKey);
      if (i.invio_in_ppi) ppiCount++;
      if (i.fuori_sede) fuoriCount++;
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
    const daysSpan = minDate && maxDate ? Math.max(1, differenceInCalendarDays(maxDate, minDate) + 1) : 1;
    const avgPerDay = total / daysSpan;
    const avgPerMonth = byMonth.size > 0 ? total / byMonth.size : 0;

    // Daily series with 7-day moving average, filling missing days with 0
    let dailySeries: Array<{ date: string; label: string; count: number; ma7: number | null }> = [];
    if (minDate && maxDate) {
      const totalDays = differenceInCalendarDays(maxDate, minDate) + 1;
      // cap at 365 for performance / readability
      const start = totalDays > 365 ? subDays(maxDate, 364) : startOfDay(minDate);
      const end = startOfDay(maxDate);
      const points: Array<{ date: string; label: string; count: number; ma7: number | null }> = [];
      let cursor = new Date(start);
      while (cursor <= end) {
        const k = romeDay(cursor);
        points.push({ date: k, label: format(cursor, "d MMM", { locale: it }), count: byDay.get(k) ?? 0, ma7: null });
        cursor = new Date(cursor.getTime() + 86400000);
      }
      // 7-day moving average
      for (let i = 0; i < points.length; i++) {
        const from = Math.max(0, i - 6);
        const slice = points.slice(from, i + 1);
        const sum = slice.reduce((s, p) => s + p.count, 0);
        points[i].ma7 = +(sum / slice.length).toFixed(2);
      }
      dailySeries = points;
    }

    const sortedMonths = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, n]) => ({
      month: m,
      label: format(new Date(m + "-01"), "MMM yy", { locale: it }),
      count: n,
    }));
    const sortedTypes = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    const sortedOperators = [...byOperator.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({
      name: name === "Sconosciuto" ? name : formatOperator(name),
      raw: name,
      count,
    }));
    const weekdayData = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"].map((d, i) => ({ day: d, count: byWeekday[i] }));

    return {
      total, avgPerDay, avgPerMonth, sortedMonths, sortedTypes, sortedOperators,
      dailySeries, weekdayData, daysOpen: openDays.size, ppiCount, fuoriCount, daysSpan,
    };
  }, [interventions]);

  const deltas = useMemo(() => {
    const prev = previousPeriodInterventions.length;
    const cur = interventions.length;
    const pct = prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
    return { prev, cur, pct };
  }, [interventions.length, previousPeriodInterventions.length]);

  const resetFilters = () => { setFrom(""); setTo(""); setOpFilter("__all"); setTypeFilter("__all"); setPpiFilter("__all"); setFuoriFilter("__all"); };

  const setQuickRange = (days: number) => {
    const end = new Date();
    const start = subDays(end, days - 1);
    setFrom(format(start, "yyyy-MM-dd"));
    setTo(format(end, "yyyy-MM-dd"));
  };

  const exportCsv = () => {
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Data", "Evento", "Operatore", "Invio PPI", "Fuori sede"];
    const rows = interventions.map((i) => [
      format(new Date(i.intervention_date), "yyyy-MM-dd HH:mm"),
      i.intervention_type,
      i.operator_username ?? "",
      i.invio_in_ppi ? "Sì" : "No",
      i.fuori_sede ? "Sì" : "No",
    ]);
    const csv = "\ufeff" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statistiche-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Caricamento…</div>;

  const primaryColor = "hsl(var(--primary) / 1)";

  return (
    <div className="min-h-screen app-surface"><RouteVisibilityGate path="/stats" />
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        eyebrow="Punto Blu"
        title="Statistiche"
        subtitle="Andamento e ripartizione degli interventi."
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><BarChart3 className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Filtri</CardTitle>
                <CardDescription className="leading-relaxed">Visualizza solo i dati d'interesse. Il confronto è calcolato sul periodo precedente della stessa durata.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setQuickRange(7)}>Ultimi 7 giorni</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickRange(30)}>Ultimi 30 giorni</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickRange(90)}>Ultimi 90 giorni</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickRange(365)}>Ultimo anno</Button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Dal</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Al</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Operatore</Label>
                <Select value={opFilter} onValueChange={setOpFilter}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__all">Tutti</SelectItem>
                    {operators.map((o) => <SelectItem key={o} value={o}>{o === "Sconosciuto" ? o : formatOperator(o)}</SelectItem>)}
                  </SelectContent></Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Evento</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__all">Tutti</SelectItem>
                    {allTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent></Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Invio in PPI</Label>
                <Select value={ppiFilter} onValueChange={setPpiFilter}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__all">Tutti</SelectItem><SelectItem value="yes">Sì</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Fuori sede</Label>
                <Select value={fuoriFilter} onValueChange={setFuoriFilter}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__all">Tutti</SelectItem><SelectItem value="yes">Sì</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={resetFilters}>Reimposta filtri</Button>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={interventions.length === 0}>
                <FileDown className="h-4 w-4 mr-1" /> Esporta CSV ({interventions.length})
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* KPI row */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={<Activity className="h-4 w-4" />}
            label="Totale interventi"
            value={stats.total}
            delta={deltas.pct}
            prev={deltas.prev}
            sparkline={stats.dailySeries.slice(-30).map((p) => p.count)}
          />
          <KpiCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Giorni di apertura"
            value={stats.daysOpen}
            sub={stats.daysSpan > 0 ? `su ${stats.daysSpan} gg. periodo` : ""}
          />
          <KpiCard
            icon={<Ambulance className="h-4 w-4" />}
            label="Invii in PPI"
            value={stats.ppiCount}
            sub={stats.total ? `${Math.round((stats.ppiCount / stats.total) * 100)}% del totale` : ""}
          />
          <KpiCard
            icon={<MapPin className="h-4 w-4" />}
            label="Fuori sede"
            value={stats.fuoriCount}
            sub={stats.total ? `${Math.round((stats.fuoriCount / stats.total) * 100)}% del totale` : ""}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="stat-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Media al giorno</p>
            <p className="mt-2 font-display text-3xl tracking-tight">{stats.avgPerDay.toFixed(2)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Su tutti i giorni del periodo</p>
          </div>
          <div className="stat-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Media al mese</p>
            <p className="mt-2 font-display text-3xl tracking-tight">{stats.avgPerMonth.toFixed(1)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Sui mesi con almeno un intervento</p>
          </div>
        </div>

        {/* Daily area with 7-day MA */}
        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><Activity className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Interventi al giorno</CardTitle>
                <CardDescription className="leading-relaxed">Serie giornaliera con media mobile a 7 giorni.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {stats.dailySeries.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nessun dato nel periodo.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.dailySeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradPrimary" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={30} />
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "var(--foreground)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="count" name="Interventi" stroke="var(--primary)" strokeWidth={1.5} fill="url(#gradPrimary)" />
                    <Line type="monotone" dataKey="ma7" name="Media mobile 7g" stroke="var(--admin)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* By month */}
          <Card className="section-card">
            <CardHeader className="section-header">
              <div className="flex items-start gap-3">
                <div className="icon-chip"><BarChart3 className="h-5 w-5" /></div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-display text-xl tracking-tight">Per mese</CardTitle>
                  <CardDescription className="leading-relaxed">Distribuzione temporale.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {stats.sortedMonths.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nessun dato</p>
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.sortedMonths} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={30} />
                      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="count" name="Interventi" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weekday */}
          <Card className="section-card">
            <CardHeader className="section-header">
              <div className="flex items-start gap-3">
                <div className="icon-chip"><CalendarDays className="h-5 w-5" /></div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-display text-xl tracking-tight">Per giorno della settimana</CardTitle>
                  <CardDescription className="leading-relaxed">Quando si concentrano gli interventi.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.weekdayData} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={30} />
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" name="Interventi" fill="var(--office)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="section-card">
            <CardHeader className="section-header">
              <div className="flex items-start gap-3">
                <div className="icon-chip"><BarChart3 className="h-5 w-5" /></div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-display text-xl tracking-tight">Top eventi</CardTitle>
                  <CardDescription className="leading-relaxed">I 10 tipi di intervento più frequenti.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {stats.sortedTypes.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nessun dato</p>
              ) : (
                <div style={{ height: Math.max(220, Math.min(stats.sortedTypes.length, 10) * 32) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={stats.sortedTypes.slice(0, 10)} margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--foreground)" }} width={110} />
                      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="count" name="Interventi" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {stats.sortedTypes.length > 10 && (
                <p className="mt-3 text-[11px] text-muted-foreground">…e altri {stats.sortedTypes.length - 10} tipi.</p>
              )}
            </CardContent>
          </Card>

          <Card className="section-card">
            <CardHeader className="section-header">
              <div className="flex items-start gap-3">
                <div className="icon-chip"><Users className="h-5 w-5" /></div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-display text-xl tracking-tight">Per operatore</CardTitle>
                  <CardDescription className="leading-relaxed">Chi ha registrato più interventi.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Operatore</TableHead><TableHead className="text-right">Numero</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
                <TableBody>
                  {stats.sortedOperators.map((o) => (
                    <TableRow key={o.raw}>
                      <TableCell>{o.name}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{o.count}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{stats.total ? Math.round((o.count / stats.total) * 100) : 0}%</TableCell>
                    </TableRow>
                  ))}
                  {stats.sortedOperators.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nessun dato</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function KpiCard({
  icon, label, value, delta, prev, sub, sparkline,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  delta?: number;
  prev?: number;
  sub?: string;
  sparkline?: number[];
}) {
  const hasDelta = typeof delta === "number";
  const isPositive = hasDelta && delta > 0;
  const isNegative = hasDelta && delta < 0;
  const trendColor = isPositive ? "text-emerald-600" : isNegative ? "text-red-600" : "text-muted-foreground";
  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const sparkData = (sparkline ?? []).map((v, i) => ({ i, v }));
  return (
    <div className="stat-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="opacity-80">{icon}</span>
          <p className="text-[10.5px] font-medium uppercase tracking-wider">{label}</p>
        </div>
        {hasDelta && (
          <div className={`flex items-center gap-0.5 text-[11px] font-semibold ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            {delta > 0 ? "+" : ""}{delta}%
          </div>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="font-display text-3xl leading-none tracking-tight">{value}</p>
        {sparkData.length > 1 && (
          <div className="h-8 w-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                <defs>
                  <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={1.5} fill={`url(#spark-${label})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {(sub || (hasDelta && typeof prev === "number")) && (
        <p className="text-[11px] text-muted-foreground">
          {sub}
          {sub && hasDelta && typeof prev === "number" ? " · " : ""}
          {hasDelta && typeof prev === "number" ? `precedente: ${prev}` : ""}
        </p>
      )}
    </div>
  );
}
