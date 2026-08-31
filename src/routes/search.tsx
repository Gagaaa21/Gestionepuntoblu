import { RouteVisibilityGate } from "@/components/RouteVisibilityGate";
import { BackButton } from "@/components/BackHome";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { formatOperator } from "@/lib/format-operator";
import { JobIcon } from "@/lib/job-titles";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeft, Search, FileText, Calendar, User, MapPin, Send,
  Activity, Heart, Wind, Droplet, Thermometer, Gauge, StickyNote, ChevronRight, Pencil,
  ChevronsUpDown, Check, Sparkles, Loader2, Plus, Clock, FileDown,
} from "lucide-react";
import { VitalsTimelineEditor, emptyVitalEntry, vitalEntryFromDb, vitalEntryToDb, type VitalEntry } from "@/components/VitalsTimelineEditor";
import { generateClinicalPdf } from "@/lib/pdf-clinical";
import { usePermissions } from "@/lib/use-permissions";
import { useServerFn } from "@tanstack/react-start";
import { AiReport } from "@/components/sport/AiReport";
import { summarizePatient } from "@/lib/api/ai.functions";
import { isAiUnavailable, aiMessage, pauseAiClient } from "@/lib/ai-guard";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): { patient?: string } =>
    typeof search.patient === "string" ? { patient: search.patient } : {},
  head: () => ({
    meta: [
      { title: "Cerca paziente · Archivio clinico Punto Blu" },
      { name: "description", content: "Ricerca rapida di pazienti, interventi e schede all'interno dell'archivio operativo." },
      { property: "og:url", content: "https://your-domain.example/search" },
      { property: "og:title", content: "Cerca paziente · Archivio clinico Punto Blu" },
      { property: "og:description", content: "Ricerca rapida di pazienti, interventi e schede all'interno dell'archivio operativo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Cerca paziente · Archivio clinico Punto Blu" },
      { name: "twitter:description", content: "Ricerca rapida di pazienti, interventi e schede all'interno dell'archivio operativo." },
    ],
    links: [{ rel: "canonical", href: "https://your-domain.example/search" }],
  }),
  component: SearchPage,
});

type Patient = { id: string; first_name: string; last_name: string; created_at: string; created_by: string | null; notes: string | null; notes_color: string | null };

const NOTE_COLORS: { label: string; value: string; bg: string; border: string; text: string }[] = [
  { label: "Giallo", value: "yellow", bg: "bg-yellow-100", border: "border-yellow-400", text: "text-yellow-900" },
  { label: "Rosso", value: "red", bg: "bg-red-100", border: "border-red-500", text: "text-red-900" },
  { label: "Arancione", value: "orange", bg: "bg-orange-100", border: "border-orange-400", text: "text-orange-900" },
  { label: "Verde", value: "green", bg: "bg-green-100", border: "border-green-500", text: "text-green-900" },
  { label: "Blu", value: "blue", bg: "bg-blue-100", border: "border-blue-500", text: "text-blue-900" },
  { label: "Viola", value: "purple", bg: "bg-purple-100", border: "border-purple-500", text: "text-purple-900" },
];
const noteColorClasses = (v: string | null | undefined) =>
  NOTE_COLORS.find((c) => c.value === v) ?? NOTE_COLORS[0];
type Intervention = {
  id: string; patient_id: string; intervention_type: string; intervention_date: string;
  invio_in_ppi: boolean; fuori_sede: boolean; notes: string | null; operator_username: string | null;
  created_by: string | null;
  vs_pas: number | null; vs_pad: number | null; vs_fc: number | null;
  vs_fr: number | null; vs_spo2: number | null; vs_temp: number | null; vs_glicemia: number | null;
  vitals_timeline: any[] | null;
};


function toNumOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Build the list of vital measurements for an intervention: T1 from columns + T2+ from vitals_timeline. */
function buildVitalsList(i: Intervention) {
  const base = { vs_pas: i.vs_pas, vs_pad: i.vs_pad, vs_fc: i.vs_fc, vs_fr: i.vs_fr, vs_spo2: i.vs_spo2, vs_temp: i.vs_temp, vs_glicemia: i.vs_glicemia };
  const extras = Array.isArray(i.vitals_timeline) ? i.vitals_timeline : [];
  const all: Array<{ label: string; time: string; values: Record<string, any> }> = [];
  const hasAny = (v: Record<string, any>) => Object.values(v).some((x) => x != null && x !== "");
  const t1At = ((i as any).extra_data?.t1_at as string) || format(new Date(i.intervention_date), "HH:mm");
  if (hasAny(base)) all.push({ label: "T1", time: t1At, values: base });
  extras.forEach((v: any) => {
    if (hasAny({ ...(v ?? {}), at: undefined, label: undefined })) all.push({ label: "", time: v?.at || "", values: v });
  });
  // Re-number sequentially so labels stay consistent T1,T2,T3...
  return all.map((x, idx) => ({ ...x, label: `T${idx + 1}` }));
}


function renderVitalsRow(values: Record<string, any>) {
  const items: Array<{ label: string; unit: string; icon: React.ComponentType<{ className?: string }>; val: string }> = [];
  if (values.vs_pas != null || values.vs_pad != null) items.push({ label: "Pressione", unit: "mmHg", icon: Gauge, val: `${values.vs_pas ?? "—"}/${values.vs_pad ?? "—"}` });
  if (values.vs_fc != null) items.push({ label: "FC", unit: "bpm", icon: Heart, val: `${values.vs_fc}` });
  if (values.vs_fr != null) items.push({ label: "FR", unit: "n/min", icon: Wind, val: `${values.vs_fr}` });
  if (values.vs_spo2 != null) items.push({ label: "SpO₂", unit: "%", icon: Activity, val: `${values.vs_spo2}` });
  if (values.vs_temp != null) items.push({ label: "Temperatura", unit: "°C", icon: Thermometer, val: `${values.vs_temp}` });
  if (values.vs_glicemia != null) items.push({ label: "Glicemia", unit: "mg/dL", icon: Droplet, val: `${values.vs_glicemia}` });
  return items;
}

function SearchPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSoft, setAiSoft] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const summarizeFn = useServerFn(summarizePatient);
  const [editIntv, setEditIntv] = useState<Intervention | null>(null);
  const [editVitals, setEditVitals] = useState<VitalEntry[]>([emptyVitalEntry()]);
  useEffect(() => {
    if (!editIntv) return;
    const t1 = vitalEntryFromDb(editIntv);
    t1.at = ((editIntv as any).extra_data?.t1_at as string) || format(new Date(editIntv.intervention_date), "HH:mm");
    const extras = Array.isArray(editIntv.vitals_timeline)
      ? editIntv.vitals_timeline.map((v: any) => vitalEntryFromDb(v))
      : [];
    setEditVitals([t1, ...extras]);
    // We intentionally only resync when the intervention identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editIntv?.id]);

  const [types, setTypes] = useState<{ id: string; name: string; parent_id: string | null }[]>([]);
  const [eiTypeOpen, setEiTypeOpen] = useState(false);

  const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const knownType = editIntv ? types.find((t) => normName(t.name) === normName(editIntv.intervention_type)) : undefined;
  const eiTypeSel = editIntv ? (knownType ? knownType.name : "__altro") : "";

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: r } = await supabase.from("user_roles" as any).select("role").eq("user_id", uid);
        setIsAdmin(!!(r as any)?.some((x: any) => x.role === "admin"));
      }
    })();
  }, []);

  const loadPatients = () => {
    supabase.from("patients" as any).select("*").order("last_name")
      .then(({ data }) => setPatients((data as any) ?? []));
  };
  useEffect(() => { loadPatients(); }, []);
  useEffect(() => {
    supabase.from("intervention_types" as any).select("id,name,parent_id").order("sort_order").order("name")
      .then(({ data }) => setTypes(((data as any) ?? []).map((t: any) => ({ id: t.id, name: t.name, parent_id: t.parent_id ?? null }))));
  }, []);

  const loadInterventions = (patientId: string) => {
    supabase.from("interventions" as any).select("*").eq("patient_id", patientId)
      .order("intervention_date", { ascending: false })
      .then(({ data }) => setInterventions((data as any) ?? []));
  };

  // Apertura diretta della cartella da link esterni (?patient=<id>)
  const { patient: patientParam } = Route.useSearch();
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (!patientParam || autoOpened || patients.length === 0) return;
    const p = patients.find((x) => x.id === patientParam);
    if (!p) return;
    setAutoOpened(true);
    setSelected(p); setOpen(true);
    setAiSummary(null); setAiError(null); setAiSoft(false); setAiLoading(false);
  }, [patientParam, patients, autoOpened]);

  useEffect(() => {
    if (!selected) { setInterventions([]); return; }
    loadInterventions(selected.id);
  }, [selected]);

  const filtered = patients.filter((p) =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(q.toLowerCase()),
  );

  const { perms } = usePermissions();
  const canViewOthers = isAdmin || perms.can_view_others_interventions;
  const canManageAnag = isAdmin || perms.can_manage_anagraphics;
  const canEditPatient = (p: Patient) => canManageAnag && (isAdmin || (!!userId && p.created_by === userId));
  const canEditIntv = (i: Intervention) => isAdmin || (!!userId && i.created_by === userId && perms.can_modify_own_interventions);
  const visibleInterventions = useMemo(
    () => canViewOthers ? interventions : interventions.filter((i) => i.created_by === userId),
    [interventions, canViewOthers, userId],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Intervention[]>();
    for (const i of visibleInterventions) {
      const key = format(new Date(i.intervention_date), "yyyy-MM");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    }
    return Array.from(map.entries());
  }, [visibleInterventions]);

  const openPatient = (p: Patient) => {
    setSelected(p); setOpen(true);
    setAiSummary(null); setAiError(null); setAiSoft(false); setAiLoading(false);
  };

  const runAiSummary = async () => {
    if (!selected) return;
    setAiLoading(true); setAiError(null); setAiSummary(null);
    try {
      const res = await summarizeFn({ data: { patientId: selected.id } });
      setAiSummary(res.summary);
    } catch (e) {
      if (isAiUnavailable(e)) {
        pauseAiClient();
        setAiSoft(true);
        setAiError(aiMessage(e));
      } else {
        setAiSoft(false);
        setAiError(e instanceof Error ? e.message : "Errore durante la generazione del riassunto.");
      }
    } finally {
      setAiLoading(false);
    }
  };

  // Il briefing AI parte SOLO su richiesta esplicita dell'utente.


  const savePatient = async (p: Patient) => {
    const { error } = await supabase.from("patients" as any)
      .update({ first_name: p.first_name, last_name: p.last_name, notes: p.notes?.trim() ? p.notes : null, notes_color: p.notes_color })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Paziente aggiornato");
    setEditPatient(null);
    loadPatients();
    if (selected?.id === p.id) setSelected(p);
  };

  const saveIntv = async (i: Intervention) => {
    const raw = (i.intervention_type ?? "").trim();
    if (!raw) return toast.error("Specifica l'evento");
    const match = types.find((t) => normName(t.name) === normName(raw));
    const finalType = match ? match.name : raw;
    const t1 = vitalEntryToDb(editVitals[0] ?? emptyVitalEntry());
    const timeline = editVitals.slice(1).map((e, idx) => ({ label: `T${idx + 2}`, at: e.at || null, ...vitalEntryToDb(e) }));
    const { error } = await supabase.from("interventions" as any).update({
      intervention_type: finalType,
      intervention_date: i.intervention_date,
      invio_in_ppi: i.invio_in_ppi,
      fuori_sede: i.fuori_sede,
      notes: i.notes,
      ...t1,
      extra_data: { ...(((i as any).extra_data as Record<string, any>) ?? {}), t1_at: editVitals[0]?.at || null },
      vitals_timeline: timeline,
    }).eq("id", i.id);

    if (error) return toast.error(error.message);
    toast.success("Intervento aggiornato");
    setEditIntv(null);
    if (selected) loadInterventions(selected.id);
  };

  const patientLabel = () => selected ? `${selected.last_name} ${selected.first_name}` : "Paziente";
  const downloadFolderPdf = async () => {
    if (!selected) return;
    try {
      await generateClinicalPdf({
        patientName: patientLabel(),
        patient: selected,
        interventions: visibleInterventions as any,
      });
      toast.success("Cartella clinica scaricata");
    } catch (e: any) {
      toast.error(e?.message ?? "Impossibile generare il PDF");
    }
  };
  const downloadIntvPdf = async (i: Intervention) => {
    try {
      await generateClinicalPdf({
        patientName: patientLabel(),
        patient: selected,
        interventions: [i as any],
        single: true,
      });
      toast.success("Referto scaricato");
    } catch (e: any) {
      toast.error(e?.message ?? "Impossibile generare il PDF");
    }
  };



  return (
    <div className="min-h-screen app-surface"><RouteVisibilityGate path="/search" />
      <header className="page-header">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <BackButton />
          <div className="icon-chip"><Search className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h1 className="font-display text-lg leading-tight tracking-tight">Cerca cartella clinica</h1>
            <p className="text-xs text-muted-foreground">Apri lo storico interventi di un paziente.</p>
          </div>
        </div>
      </header>


      <main className="container mx-auto px-4 py-6">
        <Card className="section-card max-w-3xl mx-auto">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><Search className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Pazienti</CardTitle>
                <CardDescription className="leading-relaxed">Cerca per nome o cognome e apri la cartella clinica.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Cerca paziente..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-[65vh] overflow-y-auto space-y-2 pr-1">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => openPatient(p)}
                  className="patient-row group"
                >
                  <div className="avatar">
                    {p.last_name[0]}{p.first_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      {p.last_name} {p.first_name}
                      {p.notes && (() => {
                        const c = noteColorClasses(p.notes_color);
                        return <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[10px] font-semibold", c.bg, c.border, c.text)} title={p.notes}><StickyNote className="h-2.5 w-2.5" /> Note</span>;
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Aggiunto il {format(new Date(p.created_at), "dd MMM yyyy", { locale: it })}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-10 text-center text-sm text-muted-foreground">Nessun paziente</div>
              )}
            </div>
          </CardContent>

        </Card>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl w-[calc(100vw-1.5rem)] p-0 flex flex-col max-h-[88vh] overflow-hidden gap-0">
          {selected && (
            <>
              <DialogHeader className="px-6 pt-6 pb-4 border-b bg-linear-to-br from-primary/10 via-primary/5 to-transparent text-left space-y-0">

                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-semibold shadow-sm">
                    {selected.last_name[0]}{selected.first_name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-xl flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      {selected.last_name} {selected.first_name}
                    </DialogTitle>
                    <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" />
                        {visibleInterventions.length} {visibleInterventions.length === 1 ? "intervento" : "interventi"}
                      </span>
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />
                        Dal {format(new Date(selected.created_at), "dd/MM/yyyy")}
                      </span>
                    </DialogDescription>
                  </div>
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    <Button
                      size="sm"
                      onClick={() => {
                        sessionStorage.setItem("prefillPatient", JSON.stringify({
                          firstName: selected.first_name,
                          lastName: selected.last_name,
                        }));
                        navigate({ to: "/dashboard" });
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Registra intervento
                    </Button>
                    {canEditPatient(selected) && (
                      <Button size="sm" variant="outline" onClick={() => setEditPatient(selected)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Modifica
                      </Button>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                <div className="px-6 py-5 space-y-6">

                  {selected.notes && (() => {
                    const c = noteColorClasses(selected.notes_color);
                    return (
                      <div className={cn("rounded-xl border-2 p-4 shadow-sm", c.bg, c.border, c.text)}>
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-1.5">
                          <StickyNote className="h-4 w-4" /> Note paziente
                        </div>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed font-medium">{selected.notes}</p>
                      </div>
                    );
                  })()}

                  {/* AI patient briefing — compatto, il risultato si apre in sovraimpressione */}
                  {visibleInterventions.length > 0 && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-xs font-medium truncate">Briefing AI del paziente</span>
                      </div>
                      {aiLoading ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generazione…
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { setAiOpen(true); if (!aiSummary) runAiSummary(); }}
                        >
                          {aiSummary ? "Apri briefing" : "Genera"}
                        </Button>
                      )}
                    </div>
                  )}

                  {visibleInterventions.length > 0 && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileDown className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-xs font-medium truncate">Cartella clinica in PDF (carta intestata S.O.G.IT.)</span>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => downloadFolderPdf()}>
                        Scarica
                      </Button>
                    </div>
                  )}




                  {visibleInterventions.length === 0 && (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                      <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      Nessun intervento registrato per questo paziente.
                    </div>
                  )}

                  {grouped.map(([month, items]) => (
                    <section key={month} className="space-y-3">
                      <div className="sticky top-0 z-10 -mx-1 bg-background/90 px-1 py-1.5 backdrop-blur-md">
                        <div className="flex items-center gap-3">
                          <h3 className="eyebrow whitespace-nowrap text-[11px] text-muted-foreground">
                            {format(new Date(month + "-01"), "MMMM yyyy", { locale: it })}
                          </h3>
                          <span className="h-px flex-1 bg-border/70" />
                          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {items.length} {items.length === 1 ? "intervento" : "interventi"}
                          </span>
                        </div>
                      </div>

                      {items.map((i) => {
                        const timeline = buildVitalsList(i);
                        return (
                          <article key={i.id} className="group relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                            <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary/70" />
                            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 bg-muted/25 py-3 pl-5 pr-4">
                              <div className="min-w-0">
                                <div className="font-semibold leading-tight tracking-tight">{i.intervention_type}</div>
                                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(i.intervention_date), "EEEE dd MMM yyyy · HH:mm", { locale: it })}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {i.invio_in_ppi && (
                                  <Badge variant="secondary" className="gap-1"><Send className="h-3 w-3" /> PPI</Badge>
                                )}
                                {i.fuori_sede && (
                                  <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> Fuori sede</Badge>
                                )}
                                <Button size="sm" variant="ghost" className="h-7 px-2" title="Scarica referto PDF" onClick={() => downloadIntvPdf(i)}>
                                  <FileDown className="h-3.5 w-3.5" />
                                </Button>
                                {canEditIntv(i) && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditIntv(i)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </header>

                            <div className="space-y-4 py-4 pl-5 pr-4">
                              {timeline.length > 0 && (
                                <div className="space-y-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Parametri vitali {timeline.length > 1 && `· ${timeline.length} rilevazioni`}
                                  </div>
                                  {timeline.map((entry) => {
                                    const cells = renderVitalsRow(entry.values);
                                    return (
                                      <div key={entry.label} className="rounded-lg border border-border/60 bg-secondary/20 p-2.5">
                                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                                          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                            Tempo {entry.label}
                                          </span>
                                          {entry.time && (
                                            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                                              <Clock className="h-3 w-3" /> {entry.time}
                                            </span>
                                          )}
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                          {cells.map((v) => {
                                            const Icon = v.icon;
                                            return (
                                              <div key={v.label} className="rounded-lg border bg-background px-3 py-2 flex items-center gap-2.5">
                                                <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                                  <Icon className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{v.label}</div>
                                                  <div className="font-semibold text-sm leading-tight">
                                                    {v.val} <span className="text-[10px] font-normal text-muted-foreground">{v.unit}</span>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {i.notes && (
                                <>
                                  {timeline.length > 0 && <Separator />}
                                  <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                                      <StickyNote className="h-3 w-3" /> Note
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">
                                      {i.notes}
                                    </p>
                                  </div>
                                </>
                              )}

                              <div className="pt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                                <User className="h-3 w-3" />
                                Operatore: <span className="font-medium text-foreground inline-flex items-center gap-1.5">{formatOperator(i.operator_username)}<JobIcon username={i.operator_username} /></span>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </section>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Briefing AI in sovraimpressione */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Briefing AI
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selected ? `${selected.last_name} ${selected.first_name} · sintesi degli interventi registrati.` : ""}
            </DialogDescription>
          </DialogHeader>
          {aiLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Generazione in corso…
            </div>
          )}
          {!aiLoading && !aiSummary && !aiError && (
            <div className="space-y-3 py-4 text-center">
              <p className="text-xs text-muted-foreground">
                Il briefing viene generato solo su tua richiesta.
              </p>
              <Button size="sm" onClick={runAiSummary} disabled={!selected}>
                <Sparkles className="mr-2 h-4 w-4" /> Genera briefing
              </Button>
            </div>
          )}
          {!aiLoading && aiError && (
            <div className={aiSoft
              ? "rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
              : "text-sm text-destructive"}>
              {aiError}

              <button type="button" onClick={runAiSummary} className="ml-2 font-medium text-foreground underline underline-offset-2">
                Riprova
              </button>
            </div>
          )}
          {!aiLoading && aiSummary && <AiReport text={aiSummary} compact />}
          {!aiLoading && (aiSummary || aiError) && (
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={runAiSummary}>Rigenera</Button>
              <Button size="sm" variant="secondary" onClick={() => setAiOpen(false)}>Chiudi</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>



      {/* Edit patient dialog */}
      <Dialog open={!!editPatient} onOpenChange={(o) => !o && setEditPatient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica paziente</DialogTitle>
            <DialogDescription>Aggiorna i dati e le note (es. allergie) del paziente.</DialogDescription>
          </DialogHeader>
          {editPatient && (
            <div className="space-y-3">
              <div>
                <Label>Cognome</Label>
                <Input value={editPatient.last_name}
                  onChange={(e) => setEditPatient({ ...editPatient, last_name: e.target.value })} />
              </div>
              <div>
                <Label>Nome</Label>
                <Input value={editPatient.first_name}
                  onChange={(e) => setEditPatient({ ...editPatient, first_name: e.target.value })} />
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" /> Note (allergie, avvisi...)</Label>
                <Textarea rows={3} placeholder="Es. Allergia penicillina, portatore di pacemaker..."
                  value={editPatient.notes ?? ""}
                  onChange={(e) => setEditPatient({ ...editPatient, notes: e.target.value })} />
              </div>
              <div>
                <Label>Colore evidenziatore</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {NOTE_COLORS.map((c) => {
                    const active = (editPatient.notes_color ?? "yellow") === c.value;
                    return (
                      <button key={c.value} type="button"
                        onClick={() => setEditPatient({ ...editPatient, notes_color: c.value })}
                        className={cn("h-9 w-9 rounded-full border-2 transition-all", c.bg, c.border,
                          active ? "ring-2 ring-offset-2 ring-foreground scale-110" : "opacity-70 hover:opacity-100")}
                        aria-label={c.label} title={c.label} />
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPatient(null)}>Annulla</Button>
            <Button onClick={() => editPatient && savePatient(editPatient)}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit intervention dialog */}
      <Dialog open={!!editIntv} onOpenChange={(o) => !o && setEditIntv(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica intervento</DialogTitle>
            <DialogDescription>Aggiorna dati e parametri vitali.</DialogDescription>
          </DialogHeader>
          {editIntv && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tipo intervento</Label>
                  <Popover open={eiTypeOpen} onOpenChange={setEiTypeOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {eiTypeSel === "__altro" ? "Altro…" : (eiTypeSel || "Seleziona evento...")}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Cerca evento..." />
                        <CommandList
                          onWheel={(e) => {
                            // react-remove-scroll (Dialog) blocca la wheel sul portal del Popover.
                            // Scrolliamo manualmente la lista.
                            e.currentTarget.scrollTop += e.deltaY;
                          }}
                        >
                          <CommandEmpty>Nessun risultato. Usa "Altro" per inserire un evento personalizzato.</CommandEmpty>
                          {(() => {
                            const sortIt = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "it", { sensitivity: "base" });
                            const parents = types.filter((t) => !t.parent_id).sort(sortIt);
                            const childrenOf = (pid: string) => types.filter((t) => t.parent_id === pid).sort(sortIt);
                            const flatParents = parents.filter((p) => childrenOf(p.id).length === 0);
                            const groupedParents = parents.filter((p) => childrenOf(p.id).length > 0);
                            const pick = (name: string) => { setEditIntv({ ...editIntv, intervention_type: name }); setEiTypeOpen(false); };
                            return (
                              <>
                                {flatParents.length > 0 && (
                                  <CommandGroup>
                                    {flatParents.map((t) => (
                                      <CommandItem key={t.id} value={t.name} onSelect={() => pick(t.name)}>
                                        <Check className={cn("mr-2 h-4 w-4", eiTypeSel === t.name ? "opacity-100" : "opacity-0")} />
                                        {t.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                {groupedParents.map((p) => (
                                  <CommandGroup key={p.id} heading={p.name}>
                                    <CommandItem value={`${p.name} generico`} onSelect={() => pick(p.name)}>
                                      <Check className={cn("mr-2 h-4 w-4", eiTypeSel === p.name ? "opacity-100" : "opacity-0")} />
                                      <span className="text-muted-foreground">{p.name} (generico)</span>
                                    </CommandItem>
                                    {childrenOf(p.id).map((c) => (
                                      <CommandItem key={c.id} value={`${p.name} ${c.name}`} onSelect={() => pick(c.name)}>
                                        <Check className={cn("mr-2 h-4 w-4", eiTypeSel === c.name ? "opacity-100" : "opacity-0")} />
                                        {c.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                ))}
                                <CommandGroup>
                                  <CommandItem value="__altro" onSelect={() => { setEditIntv({ ...editIntv, intervention_type: "" }); setEiTypeOpen(false); }}>
                                    <Check className={cn("mr-2 h-4 w-4", eiTypeSel === "__altro" ? "opacity-100" : "opacity-0")} />
                                    Altro (specifica manualmente)
                                  </CommandItem>
                                </CommandGroup>
                              </>
                            );
                          })()}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {eiTypeSel === "__altro" && (
                    <Input placeholder="Scrivi l'evento" value={editIntv.intervention_type}
                      onChange={(e) => setEditIntv({ ...editIntv, intervention_type: e.target.value })} />
                  )}
                </div>
                <div>
                  <Label>Data e ora</Label>
                  <Input type="datetime-local"
                    value={format(new Date(editIntv.intervention_date), "yyyy-MM-dd'T'HH:mm")}
                    onChange={(e) => setEditIntv({ ...editIntv, intervention_date: new Date(e.target.value).toISOString() })} />
                </div>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={editIntv.invio_in_ppi}
                    onCheckedChange={(v) => setEditIntv({ ...editIntv, invio_in_ppi: v })} />
                  Invio in PPI
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={editIntv.fuori_sede}
                    onCheckedChange={(v) => setEditIntv({ ...editIntv, fuori_sede: v })} />
                  Fuori sede
                </label>
              </div>

              <Separator />
              <VitalsTimelineEditor entries={editVitals} onChange={setEditVitals} />


              <div>
                <Label>Note</Label>
                <Textarea rows={4} value={editIntv.notes ?? ""}
                  onChange={(e) => setEditIntv({ ...editIntv, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditIntv(null)}>Annulla</Button>
            <Button onClick={() => editIntv && saveIntv(editIntv)}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
