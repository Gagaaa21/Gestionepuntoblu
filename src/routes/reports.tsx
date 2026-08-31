import { RouteVisibilityGate } from "@/components/RouteVisibilityGate";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackHome";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, Flame, Plus, Trash2, Circle, CheckCircle2, Clock, Ban } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { enqueueInsert, isNetworkError } from "@/lib/offline-queue";
import { JobIcon } from "@/lib/job-titles";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Segnalazioni · Archivio clinico Punto Blu" },
      { name: "description", content: "Elenco dei resoconti generati con filtri per periodo, area e tipologia di attività." },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app/reports" },
      { property: "og:title", content: "Segnalazioni · Archivio clinico Punto Blu" },
      { property: "og:description", content: "Elenco dei resoconti generati con filtri per periodo, area e tipologia di attività." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Segnalazioni · Archivio clinico Punto Blu" },
      { name: "twitter:description", content: "Elenco dei resoconti generati con filtri per periodo, area e tipologia di attività." },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app/reports" }],
  }),
  component: ReportsPage,
});

type Urgency = "urgent" | "deferrable" | "not_urgent";
type Status = "new" | "in_progress" | "resolved" | "ignored";
type Report = {
  id: string; user_id: string; username: string; report_date: string;
  problem: string; urgency: Urgency; status: Status;
  resolved_by: string | null; resolved_at: string | null; created_at: string;
};

const todayRome = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const prettyDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(d);
};

const urgencyMeta: Record<Urgency, { label: string; icon: React.ReactElement; ring: string }> = {
  urgent: {
    label: "Urgente",
    icon: <Flame className="h-4 w-4 text-red-600" />,
    ring: "ring-red-200 bg-red-50 text-red-700",
  },
  deferrable: {
    label: "Differibile",
    icon: <span className="inline-block h-3 w-3 rounded-full bg-yellow-400 ring-2 ring-yellow-200" />,
    ring: "ring-yellow-200 bg-yellow-50 text-yellow-800",
  },
  not_urgent: {
    label: "Non urgente",
    icon: <span className="inline-block h-3 w-3 rounded-full bg-white ring-2 ring-slate-300" />,
    ring: "ring-slate-200 bg-slate-50 text-slate-700",
  },
};

const statusMeta: Record<Status, { label: string; bar: string; chip: string; icon: React.ReactElement }> = {
  new: {
    label: "Da leggere",
    bar: "bg-red-500",
    chip: "bg-red-100 text-red-800 ring-red-200",
    icon: <Circle className="h-3.5 w-3.5 fill-red-500 text-red-500" />,
  },
  in_progress: {
    label: "In risoluzione",
    bar: "bg-orange-500",
    chip: "bg-orange-100 text-orange-800 ring-orange-200",
    icon: <Clock className="h-3.5 w-3.5 text-orange-600" />,
  },
  resolved: {
    label: "Risolta",
    bar: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  },
  ignored: {
    label: "Ignorata",
    bar: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    icon: <Ban className="h-3.5 w-3.5 text-emerald-600" />,
  },
};

function ReportsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<"all" | Status>("all");

  const [date, setDate] = useState(todayRome());
  const [problem, setProblem] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("not_urgent");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("reports" as any)
      .select("*")
      .order("created_at", { ascending: false });
    setReports((data as any) ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/auth" }); return; }
      const { data: profile } = await supabase.from("profiles" as any).select("username").eq("id", data.user.id).maybeSingle();
      const { data: roles } = await supabase.from("user_roles" as any).select("role").eq("user_id", data.user.id);
      setUser(data.user);
      setUsername((profile as any)?.username ?? "");
      setIsAdmin(!!(roles as any)?.some((r: any) => r.role === "admin"));
      load();
    })();

    const channel = supabase
      .channel("reports-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(
    () => filter === "all" ? reports : reports.filter((r) => r.status === filter),
    [reports, filter]
  );

  const counts = useMemo(() => ({
    all: reports.length,
    new: reports.filter((r) => r.status === "new").length,
    in_progress: reports.filter((r) => r.status === "in_progress").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
    ignored: reports.filter((r) => r.status === "ignored").length,
  }), [reports]);

  if (!user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problem.trim()) return toast.error("Descrivi la problematica");
    setSaving(true);
    const payload = {
      user_id: user.id,
      username,
      report_date: date,
      problem: problem.trim(),
      urgency,
      status: "new",
    };
    const resetForm = () => { setProblem(""); setUrgency("not_urgent"); setDate(todayRome()); };
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueueInsert("reports", payload);
      setSaving(false);
      resetForm();
      toast.success("Sei offline — la segnalazione verrà inviata appena torna la rete");
      return;
    }
    const { error } = await supabase.from("reports" as any).insert(payload);
    setSaving(false);
    if (error) {
      if (isNetworkError(error)) {
        enqueueInsert("reports", payload);
        resetForm();
        toast.success("Sei offline — la segnalazione verrà inviata appena torna la rete");
        return;
      }
      return toast.error(error.message);
    }
    resetForm();
    toast.success("Segnalazione inviata");
    load();
  };

  const updateStatus = async (id: string, status: Status) => {
    const patch: any = { status };
    if (status === "resolved" || status === "ignored") {
      patch.resolved_by = user.id;
      patch.resolved_at = new Date().toISOString();
    } else {
      patch.resolved_by = null;
      patch.resolved_at = null;
    }
    const { error } = await supabase.from("reports" as any).update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Stato aggiornato");
    load();
  };

  const removeReport = async (id: string) => {
    if (!confirm("Eliminare la segnalazione?")) return;
    const { error } = await supabase.from("reports" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Segnalazione eliminata");
    load();
  };

  return (
    <div className="min-h-screen app-surface"><RouteVisibilityGate path="/reports" />
      <PageHeader
        icon={<AlertTriangle className="h-5 w-5" />}
        eyebrow="Operatività"
        title="Segnalazioni"
        subtitle="Problematiche segnalate dagli operatori"
      />

      <main className="container mx-auto space-y-6 px-4 py-8">
        {/* New report */}
        <Card className="border-border/60" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display"><Plus className="h-5 w-5 text-primary" /> Nuova segnalazione</CardTitle>
            <CardDescription>Indica data, problematica e urgenza.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Urgenza</Label>
                <Select value={urgency} onValueChange={(v) => setUrgency(v as Urgency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent"><span className="inline-flex items-center gap-2"><Flame className="h-4 w-4 text-red-600" /> Urgente</span></SelectItem>
                    <SelectItem value="deferrable"><span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-yellow-400 ring-2 ring-yellow-200" /> Differibile</span></SelectItem>
                    <SelectItem value="not_urgent"><span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full bg-white ring-2 ring-slate-300" /> Non urgente</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-4">
                <Label>Problematica</Label>
                <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Descrivi il problema riscontrato..." required rows={3} />
              </div>
              <Button type="submit" disabled={saving} className="sm:col-span-4">
                {saving ? "Invio..." : "Invia segnalazione"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "new", "in_progress", "resolved", "ignored"] as const).map((k) => {
            const label = k === "all" ? "Tutte" : statusMeta[k as Status].label;
            const n = counts[k];
            const active = filter === k;
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
                  active ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-foreground ring-border/60 hover:bg-secondary"
                )}
              >
                {label} <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-primary-foreground/20" : "bg-secondary")}>{n}</span>
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nessuna segnalazione.
              </CardContent>
            </Card>
          ) : filtered.map((r) => {
            const u = urgencyMeta[r.urgency];
            const s = statusMeta[r.status];
            const canDelete = isAdmin || r.user_id === user.id;
            return (
              <article
                key={r.id}
                className="relative overflow-hidden rounded-2xl border border-border/60 bg-card"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className={cn("absolute inset-y-0 left-0 w-1.5", s.bar)} />
                <div className="grid gap-4 p-5 pl-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", u.ring)}>
                        {u.icon} {u.label}
                      </span>
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", s.chip)}>
                        {s.icon} {s.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {prettyDate(r.report_date)} · <span className="font-medium text-foreground inline-flex items-center gap-1.5">{r.username}<JobIcon username={r.username} /></span>
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{r.problem}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {isAdmin && r.status === "new" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "in_progress")}>
                        <Clock className="mr-1 h-3.5 w-3.5" /> In risoluzione
                      </Button>
                    )}
                    {isAdmin && r.status !== "resolved" && (
                      <Button size="sm" onClick={() => updateStatus(r.id, "resolved")} className="bg-emerald-600 hover:bg-emerald-700">
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Risolvi
                      </Button>
                    )}
                    {isAdmin && r.status !== "ignored" && r.status !== "resolved" && (
                      <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, "ignored")}>
                        <Ban className="mr-1 h-3.5 w-3.5" /> Ignora
                      </Button>
                    )}
                    {isAdmin && (r.status === "resolved" || r.status === "ignored") && (
                      <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, "new")}>
                        Riapri
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeReport(r.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
