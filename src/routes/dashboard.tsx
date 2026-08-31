import { PatientQuickHistory } from "@/components/PatientQuickHistory";
import { createFileRoute, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveArea, clearActiveArea, type ActiveArea } from "@/lib/active-area";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { format } from "date-fns";
import { useServerFn } from "@tanstack/react-start";
import { adminDeletePatient } from "@/lib/api/admin.functions";
import {
  LogOut, Trash2, Activity, Users, FolderOpen, Plus, Shield, Pencil, BarChart3, ListChecks,
  ArrowLeft, ChevronsUpDown, FlaskConical, Check, FileDown, Heart, AlertTriangle, BookOpen, UserCircle, Briefcase, BookMarked, X, Eye, Sun, ClipboardList, Menu, Sparkles, Trophy, Layers,
  type LucideIcon,
} from "lucide-react";

import { generateDailyReport } from "@/lib/pdf-report";
import { FirstAccessFlow } from "@/components/FirstAccessFlow";
import { NotifPermissionPrompt } from "@/components/NotifPermissionPrompt";
import { ProfileDialog } from "@/components/ProfileDialog";
import { cn } from "@/lib/utils";
import logoSogit from "@/assets/logo-sogit.jpg.asset.json";
import { formatOperator } from "@/lib/format-operator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { enqueueInsert, isNetworkError } from "@/lib/offline-queue";

import { useHiddenRoutes } from "@/lib/hidden-routes";
import { VitalsTimelineEditor, emptyVitalEntry, vitalEntryToDb, type VitalEntry } from "@/components/VitalsTimelineEditor";
import { generateClinicalPdf } from "@/lib/pdf-clinical";
import { usePermissions } from "@/lib/use-permissions";
import { NotificationsBell } from "@/components/NotificationsBell";
import { JobIcon } from "@/lib/job-titles";
import { useDemoMode } from "@/lib/demo-mode";
const IntelligenceBriefingCard = lazy(() =>
  import("@/components/IntelligenceBriefingCard").then((m) => ({ default: m.IntelligenceBriefingCard })),
);

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Archivio clinico Punto Blu" },
      { name: "description", content: "Panoramica operativa quotidiana con comunicazioni, attività recenti e accesso rapido alle schede." },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app/dashboard" },
      { property: "og:title", content: "Dashboard · Archivio clinico Punto Blu" },
      { property: "og:description", content: "Panoramica operativa quotidiana con comunicazioni, attività recenti e accesso rapido alle schede." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Dashboard · Archivio clinico Punto Blu" },
      { name: "twitter:description", content: "Panoramica operativa quotidiana con comunicazioni, attività recenti e accesso rapido alle schede." },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app/dashboard" }],
  }),
  component: Dashboard,
});

type Patient = { id: string; first_name: string; last_name: string; created_at: string };
type Intervention = {
  id: string; patient_id: string | null; intervention_type: string;
  intervention_date: string; invio_in_ppi: boolean; fuori_sede: boolean;
  notes: string | null; operator_username: string | null;
  created_by: string | null;
  vs_pas: number | null; vs_pad: number | null; vs_fc: number | null;
  vs_fr: number | null; vs_spo2: number | null;
  vs_temp: number | null; vs_glicemia: number | null;
  vitals_timeline: any[] | null;
};
type IType = { id: string; name: string; sort_order: number; parent_id: string | null };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
// Un token è "iniziale" se è una sola lettera (eventualmente seguita da punto): "M", "M.", "R."
const isInitialToken = (s: string) => {
  const t = s.trim().replace(/\.+$/g, "");
  return t.length === 1 && /^[a-zA-ZÀ-ÿ]$/.test(t);
};
// Regola cartella: creo la cartella clinica SOLO se il cognome è completo (non iniziale).
// - "M.R."       → no cartella (cognome iniziale)
// - "Mario R."   → no cartella (cognome iniziale)
// - "M. Rossi"   → sì cartella (cognome completo)
// - "Mario Rossi"→ sì cartella
const shouldCreateFolder = (first: string, last: string) =>
  !!first.trim() && !!last.trim() && !isInitialToken(last);
const todayRome = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

type NavItem = { path: string; label: string; icon: LucideIcon; variant?: "office" | "admin"; gate?: "office" | "transports" | "sport" | "admin" };
const NAV_ITEMS: NavItem[] = [
  { path: "/search", label: "Cerca", icon: FolderOpen },
  { path: "/report", label: "Resoconto", icon: FileDown },
  { path: "/stats", label: "Statistiche", icon: BarChart3 },
  { path: "/checklist", label: "Check list", icon: ListChecks },
  { path: "/reports", label: "Segnalazioni", icon: AlertTriangle },
  { path: "/guide", label: "Guida", icon: BookOpen },
  { path: "/procedures", label: "Procedure", icon: BookMarked },
  { path: "/previsioni", label: "Previsioni", icon: Sun },
  { path: "/office", label: "Prestazioni ufficio", icon: Briefcase, variant: "office", gate: "office" },
  { path: "/trasporti-secondari", label: "Trasporti secondari", icon: Sparkles, variant: "office", gate: "transports" },
  { path: "/servizi-sportivi", label: "Servizi sportivi", icon: Trophy, variant: "office", gate: "sport" },
  { path: "/questionario", label: "Questionario", icon: ClipboardList, variant: "admin", gate: "admin" },
  { path: "/admin", label: "Admin", icon: Shield, variant: "admin", gate: "admin" },
];

function Dashboard() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });
  const delPatient = useServerFn(adminDeletePatient);
  const demo = useDemoMode();

  

  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOffice, setIsOffice] = useState(false);
  const [isTransports, setIsTransports] = useState(false);
  const [isSport, setIsSport] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [username, setUsername] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [types, setTypes] = useState<IType[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [typeSel, setTypeSel] = useState(""); // selected from dropdown (or "Altro")
  const [typeOther, setTypeOther] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [invioPpi, setInvioPpi] = useState(false);
  const [fuoriSede, setFuoriSede] = useState(false);
  const [retroDate, setRetroDate] = useState("");
  const [retroOperator, setRetroOperator] = useState("");
  const [allUsernames, setAllUsernames] = useState<string[]>([]);
  // vitals timeline (T1 = entries[0], T2+ = entries[1..])
  const [vitalsEntries, setVitalsEntries] = useState<VitalEntry[]>([emptyVitalEntry()]);
  // additional events on the same intervention (creates one row per event)
  const [extraEvents, setExtraEvents] = useState<{ sel: string; other: string }[]>([]);
  // custom extra fields (defined by admin programmatore)
  const [extraData, setExtraData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  // edits
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [epFirst, setEpFirst] = useState(""); const [epLast, setEpLast] = useState("");
  const [editInt, setEditInt] = useState<Intervention | null>(null);
  const [eiTypeSel, setEiTypeSel] = useState(""); const [eiTypeOther, setEiTypeOther] = useState("");
  const [eiTypeOpen, setEiTypeOpen] = useState(false);
  const [eiDate, setEiDate] = useState("");
  const [eiNotes, setEiNotes] = useState(""); const [eiPpi, setEiPpi] = useState(false); const [eiFuori, setEiFuori] = useState(false);
  const [eiVitals, setEiVitals] = useState<VitalEntry[]>([emptyVitalEntry()]);
  const [eiOperator, setEiOperator] = useState("");
  const [eiFirst, setEiFirst] = useState("");
  const [eiLast, setEiLast] = useState("");

  // read-only views (all users)
  const [viewInt, setViewInt] = useState<Intervention | null>(null);
  const [viewPatient, setViewPatient] = useState<Patient | null>(null);
  const [listView, setListView] = useState<null | "all" | "patients" | "ppi" | "fuori">(null);

  // PDF day picker
  const [reportDate, setReportDate] = useState(todayRome());

  const load = async () => {
    const [{ data: pts }, { data: ints }, { data: tps }, { data: profs }] = await Promise.all([
      supabase.from("patients" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("interventions" as any).select("*").order("intervention_date", { ascending: false }),
      supabase.from("intervention_types" as any).select("*").order("sort_order").order("name"),
      supabase.from("profiles" as any).select("username").order("username"),
    ]);
    setPatients((pts as any) ?? []);
    setInterventions((ints as any) ?? []);
    setTypes((tps as any) ?? []);
    setAllUsernames(((profs as any) ?? []).map((p: any) => p.username).filter(Boolean));
  };

  useEffect(() => {
    let cancelled = false;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { load().catch((e) => console.error("load failed", e)); }, 300);
    };
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const sUser = sess.session?.user;
        if (!sUser) { navigate({ to: "/auth", replace: true }); return; }
        if (cancelled) return;
        const [{ data: profile }, { data: roles }] = await Promise.all([
          supabase.from("profiles" as any).select("username, must_change_password").eq("id", sUser.id).maybeSingle(),
          supabase.from("user_roles" as any).select("role").eq("user_id", sUser.id),
        ]);
        if (cancelled) return;
        if ((profile as any)?.must_change_password) { navigate({ to: "/auth", replace: true }); return; }
        setUsername((profile as any)?.username ?? "");
        const rs: string[] = ((roles as any) ?? []).map((r: any) => r.role);
        setIsAdmin(rs.includes("admin"));
        setIsOffice(rs.includes("admin") && rs.includes("office"));
        setIsDeveloper(rs.includes("developer"));
        if (rs.includes("admin")) {
          const { data: perm } = await supabase.from("user_permissions" as any)
            .select("can_manage_transports, can_manage_sport").eq("user_id", sUser.id).maybeSingle();
          setIsTransports(!!(perm as any)?.can_manage_transports);
          setIsSport(!!(perm as any)?.can_manage_sport);
        }
        setUser(sUser);
        load().catch((e) => console.error("load failed", e));
      } catch (err) {
        console.error("dashboard init failed", err);
        toast.error("Errore di connessione. Ricarica la pagina.");
      }
    })();

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "interventions" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "intervention_types" }, scheduleReload)
      .subscribe();
    return () => {
      cancelled = true;
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Prefill nome/cognome quando arrivo dalla cartella clinica (search)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("prefillPatient");
      if (!raw) return;
      sessionStorage.removeItem("prefillPatient");
      const parsed = JSON.parse(raw) as { firstName?: string; lastName?: string };
      if (parsed.firstName) setFirstName(parsed.firstName);
      if (parsed.lastName) setLastName(parsed.lastName);
      setTimeout(() => {
        document.getElementById("intervention-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    } catch { /* ignore */ }
  }, []);

  const { hidden: hiddenRoutes } = useHiddenRoutes();
  const { perms } = usePermissions();
  const [activeArea, setActiveAreaState] = useState<ActiveArea | null>(null);
  useEffect(() => { setActiveAreaState(getActiveArea()); }, []);
  const showTile = (p: string) => {
    if (activeArea && !activeArea.tabs.includes(p)) return false;
    return isDeveloper || !hiddenRoutes.has(p);
  };

  const canCreate = isAdmin || perms.can_create_interventions;
  const canViewOthers = isAdmin || perms.can_view_others_interventions;
  const visibleInterventions = useMemo(
    () => canViewOthers ? interventions : interventions.filter((i) => i.created_by === user?.id),
    [interventions, canViewOthers, user?.id],
  );

  // Trova un paziente esistente con lo stesso cognome (completo), consentendo che
  // il nome corrente o quello salvato sia solo un'iniziale con la stessa lettera.
  const matchedPatient = (firstName && lastName && shouldCreateFolder(firstName, lastName))
    ? patients.find((p) => {
        if (norm(p.last_name) !== norm(lastName)) return false;
        if (norm(p.first_name) === norm(firstName)) return true;
        const a = norm(p.first_name).charAt(0);
        const b = norm(firstName).charAt(0);
        if (a && b && a === b && (isInitialToken(p.first_name) || isInitialToken(firstName))) return true;
        return false;
      })
    : undefined;

  // Contesto clinico intelligente sul paziente esistente (deterministico, veloce)
  const patientContext = useMemo(() => {
    if (!matchedPatient) return null;
    const hist = interventions.filter((i) => i.patient_id === matchedPatient.id);
    if (hist.length === 0) return null;
    const sorted = [...hist].sort((a, b) => (b.intervention_date ?? "").localeCompare(a.intervention_date ?? ""));
    const last = sorted[0];
    const ppiCount = hist.filter((i) => i.invio_in_ppi).length;
    const typeCounts = new Map<string, number>();
    for (const h of hist) typeCounts.set(h.intervention_type, (typeCounts.get(h.intervention_type) ?? 0) + 1);
    const topType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const isCritical = (i: any) =>
      (i.vs_pas != null && (i.vs_pas >= 180 || i.vs_pas <= 90)) ||
      (i.vs_pad != null && (i.vs_pad >= 110 || i.vs_pad <= 55)) ||
      (i.vs_fc != null && (i.vs_fc >= 130 || i.vs_fc <= 45)) ||
      (i.vs_spo2 != null && i.vs_spo2 <= 92) ||
      (i.vs_temp != null && (i.vs_temp >= 38.5 || i.vs_temp <= 35)) ||
      (i.vs_glicemia != null && (i.vs_glicemia >= 300 || i.vs_glicemia <= 55));
    const criticalCount = hist.filter(isCritical).length;
    const lastDate = last?.intervention_date ? new Date(last.intervention_date) : null;
    const daysSince = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86400000) : null;
    const alerts: string[] = [];
    if (hist.length >= 4) alerts.push(`Paziente ricorrente: ${hist.length} interventi in archivio.`);
    if (ppiCount >= 2) alerts.push(`${ppiCount} invii in PPI precedenti — valuta soglia di attenzione.`);
    if (criticalCount >= 2) alerts.push(`${criticalCount} interventi con parametri fuori range in passato.`);
    if (daysSince != null && daysSince <= 7 && hist.length >= 2) alerts.push(`Ultimo intervento solo ${daysSince} giorni fa.`);
    return {
      total: hist.length,
      lastDate: last?.intervention_date ?? null,
      daysSince,
      lastType: last?.intervention_type ?? null,
      lastPpi: !!last?.invio_in_ppi,
      topType: topType ? topType[0] : null,
      topTypeCount: topType ? topType[1] : 0,
      ppiCount,
      criticalCount,
      alerts,
    };
  }, [matchedPatient, interventions]);

  // Predizione intelligente: evento più probabile + flag più probabili
  const patientPrediction = useMemo(() => {
    if (!matchedPatient) return null;
    const hist = interventions.filter((i) => i.patient_id === matchedPatient.id);
    if (hist.length < 2) return null;
    const typeCounts = new Map<string, { count: number; ppi: number; fuori: number }>();
    for (const h of hist) {
      const prev = typeCounts.get(h.intervention_type) ?? { count: 0, ppi: 0, fuori: 0 };
      prev.count += 1;
      if (h.invio_in_ppi) prev.ppi += 1;
      if (h.fuori_sede) prev.fuori += 1;
      typeCounts.set(h.intervention_type, prev);
    }
    const ranked = [...typeCounts.entries()].sort((a, b) => b[1].count - a[1].count);
    const [name, stats] = ranked[0];
    const confidence = Math.round((stats.count / hist.length) * 100);
    if (confidence < 40) return null;
    return {
      type: name,
      confidence,
      suggestPpi: stats.ppi / stats.count >= 0.5,
      suggestFuori: stats.fuori / stats.count >= 0.5,
    };
  }, [matchedPatient, interventions]);

  // Auto-completamento cognome: suggerisce pazienti esistenti quando l'utente digita
  const nameSuggestions = useMemo(() => {
    if (matchedPatient) return [];
    const q = norm(lastName);
    if (q.length < 2) return [];
    return patients
      .filter((p) => norm(p.last_name).startsWith(q))
      .slice(0, 4);
  }, [lastName, patients, matchedPatient]);




  const dailyInterventions = useMemo(() => {
    return interventions.filter((i) => {
      const dRome = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(i.intervention_date));
      return dRome === reportDate;
    });
  }, [interventions, reportDate]);

  if (!user) {
    return (
      <div className="min-h-screen app-surface grid place-items-center">
        <div className="text-sm text-muted-foreground">Caricamento…</div>
      </div>
    );
  }

  const numOrNull = (s: string) => s.trim() === "" ? null : Number(s);

  // Match a free-typed event name to an existing admin-defined category (case-insensitive)
  const resolveTypeName = (raw: string) => {
    const n = norm(raw);
    const match = types.find((t) => norm(t.name) === n);
    return match ? match.name : raw.trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const rawType = typeSel === "__altro" ? typeOther.trim() : typeSel.trim();
    if (!rawType) { setSubmitting(false); return toast.error("Seleziona o specifica l'evento"); }
    // Collect all event names: main + extras (skip empty extras)
    const allRawTypes: string[] = [rawType];
    for (const ex of extraEvents) {
      const r = ex.sel === "__altro" ? ex.other.trim() : ex.sel.trim();
      if (r) allRawTypes.push(r);
    }
    const finalTypes = allRawTypes.map(resolveTypeName);
    // hasName è true anche con solo nome OPPURE solo cognome:
    // in tal caso l'intervento riporterà il dato senza creare la cartella clinica.
    const hasName = !!(firstName.trim() || lastName.trim());
    const createFolder = shouldCreateFolder(firstName, lastName);
    const interventionDate = isAdmin && retroDate ? new Date(retroDate).toISOString() : new Date().toISOString();
    // L'operatore è selezionabile dagli admin in modo indipendente dalla data.
    const operatorToUse = isAdmin && retroOperator ? retroOperator : username;
    const buildPayload = (finalType: string): any => ({
      patient_id: null,
      intervention_type: finalType,
      intervention_date: interventionDate,
      invio_in_ppi: invioPpi, fuori_sede: fuoriSede,
      notes: notes.trim() || null,
      operator_username: operatorToUse,
      created_by: user.id,
      ...vitalEntryToDb(vitalsEntries[0] ?? emptyVitalEntry()),
      vitals_timeline: vitalsEntries.slice(1).map((e, i) => ({
        label: `T${i + 2}`,
        at: e.at || null,
        ...vitalEntryToDb(e),
      })),
      extra_data: {
        ...((hasName && !createFolder)
          ? { ...extraData, display_name: [lastName.trim(), firstName.trim()].filter(Boolean).join(" ") }
          : extraData),
        t1_at: vitalsEntries[0]?.at || null,
      },
    });

    const resetForm = () => {
      setFirstName(""); setLastName(""); setTypeSel(""); setTypeOther(""); setNotes("");
      setInvioPpi(false); setFuoriSede(false); setRetroDate(""); setRetroOperator("");
      setVitalsEntries([emptyVitalEntry()]);
      setExtraData({}); setExtraEvents([]);
    };

    const queueOffline = () => {
      let pid: string | null = null;
      if (createFolder) {
        pid = matchedPatient?.id ?? (crypto as any).randomUUID();
        if (!matchedPatient) {
          enqueueInsert("patients", { id: pid, first_name: firstName.trim(), last_name: lastName.trim(), created_by: user.id });
        }
      }
      const joinedType = finalTypes.join(" + ");
      const p = buildPayload(joinedType);
      p.patient_id = pid;
      enqueueInsert("interventions", p);
      toast.success(finalTypes.length > 1
        ? `Sei offline — intervento con ${finalTypes.length} eventi verrà inviato appena torna la rete`
        : "Sei offline — l'intervento verrà inviato appena torna la rete");
      resetForm();
    };


    if (typeof navigator !== "undefined" && !navigator.onLine) { queueOffline(); setSubmitting(false); return; }

    try {
      let patientId: string | null = null;
      if (createFolder) {
        patientId = matchedPatient?.id ?? null;
        if (!patientId) {
          // Prima di inserire, ricerca ancora una volta un paziente esistente con lo stesso nome/cognome
          // (case-insensitive) per evitare la creazione di cartelle doppie in caso di doppio invio o
          // di race condition tra due schede aperte.
          const { data: exist } = await supabase.from("patients" as any)
            .select("id, first_name, last_name")
            .ilike("first_name", firstName.trim())
            .ilike("last_name", lastName.trim())
            .limit(1)
            .maybeSingle();
          if (exist && (exist as any).id) {
            patientId = (exist as any).id;
          } else {
            const { data: pt, error: e1 } = await supabase.from("patients" as any)
              .insert({ first_name: firstName.trim(), last_name: lastName.trim(), created_by: user.id })
              .select().single();
            if (e1) {
              // Duplicate key: la corsa concorrente ha creato la cartella nell'istante — riprova
              // recuperandola invece di far fallire l'intervento.
              const { data: retry } = await supabase.from("patients" as any)
                .select("id").ilike("first_name", firstName.trim()).ilike("last_name", lastName.trim())
                .limit(1).maybeSingle();
              if (retry && (retry as any).id) patientId = (retry as any).id;
              else throw e1;
            } else {
              patientId = (pt as any).id;
            }
          }
        } else if (matchedPatient && !isInitialToken(firstName) && isInitialToken(matchedPatient.first_name)) {
          // Se stiamo inserendo il nome per esteso e il paziente esistente era registrato con l'iniziale, aggiorno la cartella.
          await supabase.from("patients" as any)
            .update({ first_name: firstName.trim() })
            .eq("id", matchedPatient.id);
        }
      }
      const joinedType = finalTypes.join(" + ");
      const payload = { ...buildPayload(joinedType), patient_id: patientId };
      const { error: e2 } = await supabase.from("interventions" as any).insert(payload);

      if (e2) throw e2;
      const baseMsg = createFolder
        ? (matchedPatient ? "Intervento aggiunto alla cartella esistente" : "Paziente e cartella clinica creati")
        : (hasName
            ? "Intervento registrato senza cartella clinica (nome o cognome incompleto)"
            : "Intervento registrato come Paziente Sconosciuto");
      toast.success(finalTypes.length > 1 ? `${baseMsg} (${finalTypes.length} eventi)` : baseMsg);
      resetForm();
      load();
    } catch (err: any) {
      if (isNetworkError(err)) { queueOffline(); return; }
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };
  const handleDeletePatient = async (id: string) => {
    try { await delPatient({ data: { patientId: id } }); toast.success("Cartella eliminata"); load(); }
    catch (err: any) { toast.error(err.message); }
  };

  const openEditPatient = (p: Patient) => { setEditPatient(p); setEpFirst(p.first_name); setEpLast(p.last_name); };
  const savePatient = async () => {
    if (!editPatient) return;
    const { error } = await supabase.from("patients" as any).update({ first_name: epFirst.trim(), last_name: epLast.trim() }).eq("id", editPatient.id);
    if (error) return toast.error(error.message);
    toast.success("Paziente aggiornato"); setEditPatient(null); load();
  };

  const canEditInt = (i: Intervention) => isAdmin || (!!user && i.created_by === user.id && perms.can_modify_own_interventions);
  const canDeleteInt = (i: Intervention) => isAdmin || (!!user && i.created_by === user.id && perms.can_modify_own_interventions);

  const handleDeleteIntervention = async (id: string) => {
    try {
      const { error } = await supabase.from("interventions" as any).delete().eq("id", id);
      if (error) throw error;
      toast.success("Intervento eliminato");
      load();
    } catch (err: any) { toast.error(err.message); }
  };

  const openEditInt = (i: Intervention) => {
    setEditInt(i);
    const knownType = types.find((t) => norm(t.name) === norm(i.intervention_type));
    if (knownType) { setEiTypeSel(knownType.name); setEiTypeOther(""); }
    else { setEiTypeSel("__altro"); setEiTypeOther(i.intervention_type); }
    setEiDate(format(new Date(i.intervention_date), "yyyy-MM-dd'T'HH:mm"));
    setEiNotes(i.notes ?? ""); setEiPpi(i.invio_in_ppi); setEiFuori(i.fuori_sede);
    const t1: VitalEntry = {
      vs_pas: i.vs_pas?.toString() ?? "", vs_pad: i.vs_pad?.toString() ?? "",
      vs_fc: i.vs_fc?.toString() ?? "", vs_fr: i.vs_fr?.toString() ?? "",
      vs_spo2: i.vs_spo2?.toString() ?? "", vs_temp: i.vs_temp?.toString() ?? "",
      vs_glicemia: i.vs_glicemia?.toString() ?? "",
      at: ((i as any).extra_data?.t1_at as string) || format(new Date(i.intervention_date), "HH:mm"),
    };
    const extra: VitalEntry[] = Array.isArray(i.vitals_timeline)
      ? i.vitals_timeline.map((v: any) => ({
          vs_pas: v?.vs_pas?.toString() ?? "", vs_pad: v?.vs_pad?.toString() ?? "",
          vs_fc: v?.vs_fc?.toString() ?? "", vs_fr: v?.vs_fr?.toString() ?? "",
          vs_spo2: v?.vs_spo2?.toString() ?? "", vs_temp: v?.vs_temp?.toString() ?? "",
          vs_glicemia: v?.vs_glicemia?.toString() ?? "",
          at: v?.at ?? "",
        }))
      : [];

    setEiVitals([t1, ...extra]);
    setEiOperator(i.operator_username ?? "");
    // Pre-popola Nome/Cognome dal paziente collegato o dal display_name
    const linked = i.patient_id ? patients.find((x) => x.id === i.patient_id) : null;
    if (linked) {
      setEiFirst(linked.first_name); setEiLast(linked.last_name);
    } else {
      const dn: string = (i as any).extra_data?.display_name ?? "";
      // display_name è salvato come "Cognome Nome"
      const parts = dn.trim().split(/\s+/);
      if (parts.length >= 2) { setEiLast(parts[0]); setEiFirst(parts.slice(1).join(" ")); }
      else { setEiFirst(""); setEiLast(dn); }
    }
  };
  const saveInt = async () => {
    if (!editInt) return;
    const rawType = eiTypeSel === "__altro" ? eiTypeOther.trim() : eiTypeSel.trim();
    if (!rawType) return toast.error("Seleziona o specifica l'evento");
    const finalType = resolveTypeName(rawType);
    const t1 = vitalEntryToDb(eiVitals[0] ?? emptyVitalEntry());
    const timeline = eiVitals.slice(1).map((e, i) => ({ label: `T${i + 2}`, at: e.at || null, ...vitalEntryToDb(e) }));

    // Risolvi patient_id / display_name in base ai nuovi valori
    const fn = eiFirst.trim(); const ln = eiLast.trim();
    const hasName = !!(fn && ln);
    const createFolder = shouldCreateFolder(fn, ln);
    let newPatientId: string | null = null;
    const existingExtra: Record<string, any> = { ...((editInt as any).extra_data ?? {}) };
    delete existingExtra.display_name;
    let newExtra: Record<string, any> = existingExtra;
    try {
      if (createFolder) {
        const match = patients.find((p) => {
          if (norm(p.last_name) !== norm(ln)) return false;
          if (norm(p.first_name) === norm(fn)) return true;
          const a = norm(p.first_name).charAt(0);
          const b = norm(fn).charAt(0);
          if (a && b && a === b && (isInitialToken(p.first_name) || isInitialToken(fn))) return true;
          return false;
        });
        if (match) {
          newPatientId = match.id;
          if (!isInitialToken(fn) && isInitialToken(match.first_name)) {
            await supabase.from("patients" as any).update({ first_name: fn }).eq("id", match.id);
          }
        } else {
          const { data: pt, error: eP } = await supabase.from("patients" as any)
            .insert({ first_name: fn, last_name: ln, created_by: user.id }).select().single();
          if (eP) throw eP;
          newPatientId = (pt as any).id;
        }
      } else if (hasName) {
        newExtra = { ...existingExtra, display_name: `${ln} ${fn}`.trim() };
      } else if (eiLast.trim() || eiFirst.trim()) {
        // solo uno dei due riempito: salva come display_name
        newExtra = { ...existingExtra, display_name: `${ln} ${fn}`.trim() };
      }
    } catch (err: any) {
      return toast.error(err.message ?? "Errore aggiornamento paziente");
    }

    const { error } = await supabase.from("interventions" as any).update({
      intervention_type: finalType, intervention_date: new Date(eiDate).toISOString(),
      notes: eiNotes.trim() || null, invio_in_ppi: eiPpi, fuori_sede: eiFuori,
      patient_id: newPatientId,
      extra_data: { ...newExtra, t1_at: eiVitals[0]?.at || null },
      ...t1,
      vitals_timeline: timeline,
      ...(isAdmin ? { operator_username: eiOperator || null } : {}),
    }).eq("id", editInt.id);
    if (error) return toast.error(error.message);
    toast.success("Intervento aggiornato"); setEditInt(null); load();
  };




  const downloadReport = () => {
    if (dailyInterventions.length === 0) return toast.error("Nessun intervento per la data selezionata");
    generateDailyReport(reportDate, dailyInterventions as any, patients);
  };

  const vitalsLabel = (i: Intervention) => {
    const parts: string[] = [];
    if (i.vs_pas != null || i.vs_pad != null) parts.push(`PA ${i.vs_pas ?? "-"}/${i.vs_pad ?? "-"}`);
    if (i.vs_fc != null) parts.push(`FC ${i.vs_fc}`);
    if (i.vs_spo2 != null) parts.push(`SpO₂ ${i.vs_spo2}`);
    if (i.vs_temp != null) parts.push(`T ${i.vs_temp}°`);
    return parts.join(" · ");
  };

  const gates: Record<NonNullable<NavItem["gate"]>, boolean> = {
    office: isOffice, transports: isTransports, sport: isSport, admin: isAdmin,
  };

  return (

    <div className="min-h-screen app-surface">
      <header className="page-header">
        <div className="container mx-auto px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <div className="brand-chip h-11 w-11 shrink-0 sm:h-12 sm:w-12">
              <img src={logoSogit.url} alt="Logo SOGIT - Croce di San Giovanni" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="eyebrow truncate">{activeArea?.name ?? "Gestione S.O.G.IT."}</p>
              <h1 className="font-display text-lg leading-tight tracking-tight truncate sm:text-xl">Archivio clinico Punto Blu</h1>
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate font-medium text-foreground/80">{username}</span>
                {isAdmin && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-admin/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-admin ring-1 ring-admin/30"><Shield className="h-2.5 w-2.5" />Admin</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-expanded={mobileNavOpen}
              aria-label={mobileNavOpen ? "Chiudi menu" : "Apri menu"}
              className="nav-tile shrink-0 sm:hidden"
            >
              <span className="nav-tile-icon">{mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</span>
              {mobileNavOpen ? "Chiudi" : "Menu"}
            </button>
          </div>

          <div className={cn("w-full items-center gap-2 sm:flex", mobileNavOpen ? "flex flex-col sm:flex-row" : "hidden sm:flex")}>
            <Link
              to="/gestione"
              className="back-pill shrink-0 w-full sm:w-auto"
              onClick={() => { setMobileNavOpen(false); clearActiveArea(); setActiveAreaState(null); }}
            >
              <span className="back-pill-icon"><ArrowLeft className="h-4 w-4" /></span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate">Gestione SOGIT</span>
                {activeArea && (
                  <span className="block text-[10px] font-normal uppercase tracking-[0.14em] text-muted-foreground truncate">{activeArea.name}</span>
                )}
              </span>
            </Link>

            <nav className="nav-rail w-full min-w-0 flex-1 sm:w-auto" aria-label="Schede dell'area">
              {NAV_ITEMS.filter((it) => showTile(it.path) && (!it.gate || gates[it.gate])).map((it) => {
                const Icon = it.icon;
                return (
                  <Link
                    key={it.path}
                    to={it.path}
                    className="nav-tile"
                    data-variant={it.variant}
                    data-active={pathname === it.path ? "true" : undefined}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <span className="nav-tile-icon"><Icon className="h-4 w-4" /></span>
                    {it.label}
                  </Link>
                );
              })}

              {isDeveloper && !activeArea && (
                <Link to="/security" className="nav-tile" data-variant="admin" data-active={pathname === "/security" ? "true" : undefined} onClick={() => setMobileNavOpen(false)}>
                  <span className="nav-tile-icon"><Shield className="h-4 w-4" /></span>Sicurezza
                </Link>
              )}
            </nav>

            <div className="nav-cluster shrink-0 self-end sm:self-auto">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => (demo.enabled ? demo.disable() : (demo.enable(), toast.info("Modalità prova attiva: nulla verrà salvato nell'archivio reale.")))}
                  className="nav-tile"
                  data-variant="admin"
                  data-active={demo.enabled ? "true" : undefined}
                  aria-label="Modalità prova"
                >
                  <span className="nav-tile-icon"><FlaskConical className="h-4 w-4" /></span>
                  <span className="hidden sm:inline">{demo.enabled ? "Esci da prova" : "Modalità prova"}</span>
                </button>
              )}
              {user && showTile("feature:notifications") && <NotificationsBell userId={user.id} isAdmin={isAdmin} />}
              <button type="button" onClick={logout} className="nav-tile" aria-label="Esci">
                <span className="nav-tile-icon"><LogOut className="h-4 w-4" /></span>
                <span className="hidden sm:inline">Esci</span>
              </button>
            </div>
          </div>

        </div>
      </header>



      <main className="container mx-auto px-4 py-6 space-y-6">
        <Suspense fallback={null}>
          <IntelligenceBriefingCard />
        </Suspense>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <button type="button" onClick={() => setListView("all")} className="stat-card p-4 text-left hover:ring-2 hover:ring-primary/30 transition">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Interventi</p>
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20"><Activity className="h-4 w-4" /></div>
            </div>
            <p className="mt-2 font-display text-3xl tracking-tight">{interventions.length}</p>
          </button>
          <button type="button" onClick={() => setListView("patients")} className="stat-card p-4 text-left hover:ring-2 hover:ring-primary/30 transition">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pazienti</p>
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20"><Users className="h-4 w-4" /></div>
            </div>
            <p className="mt-2 font-display text-3xl tracking-tight">{patients.length}</p>
          </button>
          <button type="button" onClick={() => setListView("ppi")} className="stat-card p-4 text-left hover:ring-2 hover:ring-primary/30 transition">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Invii in PPI</p>
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20"><Heart className="h-4 w-4" /></div>
            </div>
            <p className="mt-2 font-display text-3xl tracking-tight">{interventions.filter((i) => i.invio_in_ppi).length}</p>
          </button>
          <button type="button" onClick={() => setListView("fuori")} className="stat-card p-4 text-left hover:ring-2 hover:ring-primary/30 transition">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fuori sede</p>
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20"><Briefcase className="h-4 w-4" /></div>
            </div>
            <p className="mt-2 font-display text-3xl tracking-tight">{interventions.filter((i) => i.fuori_sede).length}</p>
          </button>
        </div>



        {(true) && (
        <Card id="intervention-form" className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><Plus className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Aggiungi intervento</CardTitle>
                <CardDescription className="leading-relaxed">Se non inserisci Nome e Cognome verrà registrato come "Paziente Sconosciuto" (nessuna cartella clinica sarà creata).</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nome</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div className="space-y-2"><Label>Cognome</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
              {nameSuggestions.length > 0 && (
                <div className="sm:col-span-2 -mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> Suggerimenti:</span>
                  {nameSuggestions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setFirstName(p.first_name); setLastName(p.last_name); }}
                      className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 hover:bg-primary/10 transition-colors"
                    >
                      {p.last_name} {p.first_name}
                    </button>
                  ))}
                </div>
              )}
              {patientPrediction && !typeSel && (
                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">Predizione:</span>
                    <span className="font-semibold text-foreground">{patientPrediction.type}</span>
                    <span className="text-muted-foreground">({patientPrediction.confidence}% storico)</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs"
                    onClick={() => {
                      const known = types.find((t) => norm(t.name) === norm(patientPrediction.type));
                      if (known) setTypeSel(known.name);
                      else { setTypeSel("__altro"); setTypeOther(patientPrediction.type); }
                      if (patientPrediction.suggestPpi) setInvioPpi(true);
                      if (patientPrediction.suggestFuori) setFuoriSede(true);
                      toast.success("Suggerimento applicato");
                    }}
                  >
                    Applica
                  </Button>
                </div>
              )}
              {matchedPatient && (
                <div className="sm:col-span-2 text-sm rounded-md bg-primary/10 text-primary px-3 py-2">
                  Paziente esistente trovato: <strong>{matchedPatient.last_name} {matchedPatient.first_name}</strong>.
                </div>
              )}
              {matchedPatient && patientContext && (
                <div className="sm:col-span-2 rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 to-transparent p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary/80">
                    <Sparkles className="h-3.5 w-3.5" /> Contesto clinico
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-md bg-card px-2 py-1.5 border">
                      <div className="text-muted-foreground">Interventi</div>
                      <div className="font-semibold text-sm">{patientContext.total}</div>
                    </div>
                    <div className="rounded-md bg-card px-2 py-1.5 border">
                      <div className="text-muted-foreground">Ultimo</div>
                      <div className="font-semibold text-sm">
                        {patientContext.daysSince != null ? `${patientContext.daysSince}g fa` : "—"}
                      </div>
                    </div>
                    <div className="rounded-md bg-card px-2 py-1.5 border">
                      <div className="text-muted-foreground">Invii PPI</div>
                      <div className="font-semibold text-sm">{patientContext.ppiCount}</div>
                    </div>
                    <div className="rounded-md bg-card px-2 py-1.5 border">
                      <div className="text-muted-foreground">Param. critici</div>
                      <div className="font-semibold text-sm">{patientContext.criticalCount}</div>
                    </div>
                  </div>
                  {patientContext.topType && patientContext.topTypeCount >= 2 && (
                    <div className="text-xs text-muted-foreground">
                      Evento più frequente: <span className="font-medium text-foreground">{patientContext.topType}</span> ({patientContext.topTypeCount}×)
                    </div>
                  )}
                  {patientContext.alerts.length > 0 && (
                    <ul className="space-y-1 text-xs">
                      {patientContext.alerts.map((a, i) => (
                        <li key={i} className="flex gap-1.5 text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {matchedPatient && (
                <div className="sm:col-span-2">
                  <PatientQuickHistory
                    patientId={matchedPatient.id}
                    patientName={`${matchedPatient.last_name} ${matchedPatient.first_name}`}
                    interventions={interventions as any}
                  />
                </div>
              )}
              {(firstName || lastName) && !matchedPatient && !(firstName.trim() && lastName.trim()) && (
                <div className="sm:col-span-2 text-sm rounded-md bg-muted px-3 py-2 text-muted-foreground">
                  Inserisci sia Nome sia Cognome, oppure lasciali entrambi vuoti per registrare come "Paziente Sconosciuto".
                </div>
              )}

              {/* Type combobox */}
              <div className="space-y-2 sm:col-span-2">
                <Label>Evento</Label>
                <Popover open={typeOpen} onOpenChange={setTypeOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" role="combobox" className="w-full justify-between">
                      {typeSel === "__altro" ? "Altro…" : (typeSel || "Seleziona evento...")}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                        <CommandInput placeholder="Cerca evento..." />
                        <CommandList
                          onWheel={(e) => { e.currentTarget.scrollTop += e.deltaY; }}
                        >
                          <CommandEmpty>Nessun risultato. Usa "Altro" per inserire un evento personalizzato.</CommandEmpty>
                          {(() => {
                            const sortIt = (a: IType, b: IType) => a.name.localeCompare(b.name, "it", { sensitivity: "base" });
                            const parents = types.filter((t) => !t.parent_id).sort(sortIt);
                            const childrenOf = (pid: string) => types.filter((t) => t.parent_id === pid).sort(sortIt);
                            const flatParents = parents.filter((p) => childrenOf(p.id).length === 0);
                            const groupedParents = parents.filter((p) => childrenOf(p.id).length > 0);
                            return (
                              <>
                                {flatParents.length > 0 && (
                                  <CommandGroup>
                                    {flatParents.map((t) => (
                                      <CommandItem key={t.id} value={t.name} onSelect={() => { setTypeSel(t.name); setTypeOpen(false); }}>
                                        <Check className={cn("mr-2 h-4 w-4", typeSel === t.name ? "opacity-100" : "opacity-0")} />
                                        {t.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                {groupedParents.map((p) => (
                                  <CommandGroup key={p.id} heading={p.name}>
                                    <CommandItem value={`${p.name} generico`} onSelect={() => { setTypeSel(p.name); setTypeOpen(false); }}>
                                      <Check className={cn("mr-2 h-4 w-4", typeSel === p.name ? "opacity-100" : "opacity-0")} />
                                      <span className="text-muted-foreground">{p.name} (generico)</span>
                                    </CommandItem>
                                    {childrenOf(p.id).map((c) => (
                                      <CommandItem key={c.id} value={`${p.name} ${c.name}`} onSelect={() => { setTypeSel(c.name); setTypeOpen(false); }}>
                                        <Check className={cn("mr-2 h-4 w-4", typeSel === c.name ? "opacity-100" : "opacity-0")} />
                                        {c.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                ))}
                                <CommandGroup>
                                  <CommandItem value="__altro" onSelect={() => { setTypeSel("__altro"); setTypeOpen(false); }}>
                                    <Check className={cn("mr-2 h-4 w-4", typeSel === "__altro" ? "opacity-100" : "opacity-0")} />
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
                  {typeSel === "__altro" && (
                    <Input placeholder="Scrivi l'evento" value={typeOther} onChange={(e) => setTypeOther(e.target.value)} />
                  )}
                  {types.length === 0 && (
                    <p className="text-xs text-muted-foreground">L'admin non ha ancora definito eventi. Usa "Altro".</p>
                  )}

                  {/* Additional events on the same intervention */}
                  {extraEvents.map((ex, idx) => {
                    const sortedTypes = [...types].sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
                    const update = (patch: Partial<{ sel: string; other: string }>) =>
                      setExtraEvents((arr) => arr.map((e, i) => i === idx ? { ...e, ...patch } : e));
                    return (
                      <div key={idx} className="field-slot space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Evento aggiuntivo #{idx + 2}</Label>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setExtraEvents((arr) => arr.filter((_, i) => i !== idx))}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <Select value={ex.sel} onValueChange={(v) => update({ sel: v })}>
                          <SelectTrigger><SelectValue placeholder="Seleziona evento..." /></SelectTrigger>
                          <SelectContent>
                            {sortedTypes.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                            <SelectItem value="__altro">Altro (specifica manualmente)</SelectItem>
                          </SelectContent>
                        </Select>
                        {ex.sel === "__altro" && (
                          <Input placeholder="Scrivi l'evento" value={ex.other} onChange={(e) => update({ other: e.target.value })} />
                        )}
                      </div>
                    );
                  })}
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setExtraEvents((arr) => [...arr, { sel: "", other: "" }])}>
                    <Plus className="h-4 w-4 mr-1" /> Aggiungi altro evento
                  </Button>
              </div>

              <div className="space-y-2 sm:col-span-2"><Label>Note (facoltativo)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>

              {/* Vitals timeline */}
              <div className="sm:col-span-2 field-panel space-y-3">
                <VitalsTimelineEditor entries={vitalsEntries} onChange={setVitalsEntries} />
              </div>


              {isAdmin && (
                <div className="admin-section p-3 sm:col-span-2 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><span className="admin-badge"><Shield className="h-3 w-3" /> Solo admin</span></div>
                  <div className="space-y-2">
                    <Label>Data intervento (opzionale retro-attiva)</Label>
                    <Input type="datetime-local" value={retroDate} onChange={(e) => setRetroDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Operatore che ha svolto l'intervento</Label>
                    <Select value={retroOperator || username} onValueChange={setRetroOperator}>
                      <SelectTrigger><SelectValue placeholder="Seleziona operatore" /></SelectTrigger>
                      <SelectContent>
                        {allUsernames.map((u) => (
                          <SelectItem key={u} value={u}>{formatOperator(u)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {retroOperator && retroOperator !== username && (
                      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setRetroOperator("")}>
                        Ripristina {formatOperator(username)}
                      </button>
                    )}
                  </div>
                </div>
              )}
              <label
                htmlFor="ppi"
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-3 cursor-pointer transition-all select-none sm:col-span-1",
                  invioPpi ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30" : "border-border/60 bg-card/40 hover:border-primary/50"
                )}
              >
                <Checkbox id="ppi" checked={invioPpi} onCheckedChange={(v) => setInvioPpi(!!v)} className="h-5 w-5" />
                <span className={cn("font-semibold text-sm", invioPpi && "text-primary")}>🏥 Invio in PPI</span>
              </label>
              <label
                htmlFor="fuori"
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-3 cursor-pointer transition-all select-none sm:col-span-1",
                  fuoriSede ? "border-amber-500 bg-amber-500/10 shadow-sm ring-2 ring-amber-500/30" : "border-border/60 bg-card/40 hover:border-amber-500/50"
                )}
              >
                <Checkbox id="fuori" checked={fuoriSede} onCheckedChange={(v) => setFuoriSede(!!v)} className="h-5 w-5" />
                <span className={cn("font-semibold text-sm", fuoriSede && "text-amber-600 dark:text-amber-400")}>🚑 Intervento fuori porta</span>
              </label>
              <Button type="submit" className="sm:col-span-2" disabled={submitting}>{submitting ? "Salvataggio…" : "Registra intervento"}</Button>
            </form>
          </CardContent>
        </Card>
        )}

        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><Users className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Interventi recenti</CardTitle>
                <CardDescription className="leading-relaxed">Ultimi 50 interventi registrati.</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Paziente</TableHead><TableHead>Evento</TableHead><TableHead>Data</TableHead>
                <TableHead>Operatore</TableHead><TableHead>Parametri</TableHead><TableHead>PPI</TableHead><TableHead>Fuori</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {visibleInterventions.slice(0, 50).map((i) => {
                  const p = i.patient_id ? patients.find((x) => x.id === i.patient_id) : null;
                  const editable = canEditInt(i);
                  return (
                    <TableRow key={i.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setViewInt(i)}>
                      <TableCell>{p ? `${p.last_name} ${p.first_name}` : ((i as any).extra_data?.display_name ? <span className="italic">{(i as any).extra_data.display_name}</span> : <span className="italic text-muted-foreground">Paziente Sconosciuto</span>)}</TableCell>
                      <TableCell>{i.intervention_type}</TableCell>
                      <TableCell>{format(new Date(i.intervention_date), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {i.operator_username ? (
                        <Link
                          to="/operatori/$username"
                          params={{ username: i.operator_username }}
                          className="inline-flex items-center gap-1.5 hover:text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {formatOperator(i.operator_username)}
                          <JobIcon username={i.operator_username} />
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">{formatOperator(i.operator_username)}<JobIcon username={i.operator_username} /></span>
                      )}
                    </TableCell>
                      <TableCell className="text-xs">{vitalsLabel(i) || "—"}</TableCell>
                      <TableCell>{i.invio_in_ppi ? "Sì" : "No"}</TableCell>
                      <TableCell>{i.fuori_sede ? "Sì" : "No"}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => setViewInt(i)} aria-label="Visualizza"><Eye className="h-4 w-4" /></Button>
                        {editable && (
                          <Button variant="ghost" size="icon" onClick={() => openEditInt(i)}><Pencil className="h-4 w-4" /></Button>
                        )}
                        {canDeleteInt(i) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminare l'intervento?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  L'intervento verrà eliminato definitivamente. Operazione irreversibile.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteIntervention(i.id)}>Elimina</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {visibleInterventions.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nessun intervento ancora</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="section-card" data-tone="admin">
            <CardHeader className="section-header">
              <div className="flex items-start gap-3">
                <div className="icon-chip"><Shield className="h-5 w-5" /></div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-display text-xl tracking-tight flex items-center gap-2">
                    <span className="admin-badge"><Shield className="h-3 w-3" /> Solo admin</span> Cartelle cliniche
                  </CardTitle>
                  <CardDescription className="leading-relaxed">Modifica o elimina cartelle.</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Paziente</TableHead><TableHead>Aggiunto il</TableHead><TableHead>Interventi</TableHead><TableHead className="text-right">Azioni</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {patients.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setViewPatient(p)}>
                      <TableCell>{p.last_name} {p.first_name}</TableCell>
                      <TableCell>{format(new Date(p.created_at), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{interventions.filter((i) => i.patient_id === p.id).length}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => setViewPatient(p)} aria-label="Visualizza"><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditPatient(p)}><Pencil className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminare la cartella?</AlertDialogTitle>
                              <AlertDialogDescription>
                                La cartella di {p.last_name} {p.first_name} e tutti gli interventi associati verranno eliminati. Operazione irreversibile.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeletePatient(p.id)}>Elimina</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={!!listView} onOpenChange={(o) => !o && setListView(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {listView === "all" && `Tutti gli interventi (${visibleInterventions.length})`}
              {listView === "patients" && `Tutti i pazienti (${patients.length})`}
              {listView === "ppi" && `Tutti gli invii in PPI (${visibleInterventions.filter((i) => i.invio_in_ppi).length})`}
              {listView === "fuori" && `Tutti i fuori sede (${visibleInterventions.filter((i) => i.fuori_sede).length})`}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-auto">
            {listView === "patients" ? (
              <Table>
                <TableHeader><TableRow><TableHead>Paziente</TableHead><TableHead>Aggiunto il</TableHead><TableHead className="text-right">Interventi</TableHead></TableRow></TableHeader>
                <TableBody>
                  {patients.map((p) => {
                    const count = interventions.filter((i) => i.patient_id === p.id).length;
                    return (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => { setViewPatient(p); setListView(null); }}>
                        <TableCell className="font-medium">{p.first_name} {p.last_name}</TableCell>
                        <TableCell>{format(new Date(p.created_at), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-right">{count}</TableCell>
                      </TableRow>
                    );
                  })}
                  {patients.length === 0 && (<TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Nessun paziente</TableCell></TableRow>)}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Paziente</TableHead><TableHead>Evento</TableHead><TableHead>Operatore</TableHead><TableHead>PPI</TableHead><TableHead>Fuori</TableHead></TableRow></TableHeader>
                <TableBody>
                  {visibleInterventions
                    .filter((i) => listView === "all" || (listView === "ppi" ? i.invio_in_ppi : listView === "fuori" ? i.fuori_sede : true))
                    .map((i) => {
                      const p = patients.find((x) => x.id === i.patient_id);
                      return (
                        <TableRow key={i.id} className="cursor-pointer" onClick={() => { setViewInt(i); setListView(null); }}>
                          <TableCell className="text-xs">{format(new Date(i.intervention_date), "dd/MM/yy HH:mm")}</TableCell>
                          <TableCell className="text-sm">{p ? `${p.first_name} ${p.last_name}` : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm">{i.intervention_type}</TableCell>
                          <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                            {i.operator_username ? (
                              <Link
                                to="/operatori/$username"
                                params={{ username: i.operator_username }}
                                className="inline-flex items-center gap-1.5 hover:text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {formatOperator(i.operator_username)}
                                <JobIcon username={i.operator_username} />
                              </Link>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">{formatOperator(i.operator_username)}<JobIcon username={i.operator_username} /></span>
                            )}
                          </TableCell>
                          <TableCell>{i.invio_in_ppi ? "Sì" : "No"}</TableCell>
                          <TableCell>{i.fuori_sede ? "Sì" : "No"}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setListView(null)}>Chiudi</Button></DialogFooter>
        </DialogContent>
      </Dialog>



      <Dialog open={!!editPatient} onOpenChange={(o) => !o && setEditPatient(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifica paziente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Nome</Label><Input value={epFirst} onChange={(e) => setEpFirst(e.target.value)} /></div>
            <div className="space-y-2"><Label>Cognome</Label><Input value={epLast} onChange={(e) => setEpLast(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditPatient(null)}>Annulla</Button><Button onClick={savePatient}>Salva</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editInt} onOpenChange={(o) => !o && setEditInt(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Modifica intervento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>Nome</Label><Input value={eiFirst} onChange={(e) => setEiFirst(e.target.value)} placeholder="Nome" /></div>
              <div className="space-y-1"><Label>Cognome</Label><Input value={eiLast} onChange={(e) => setEiLast(e.target.value)} placeholder="Cognome" /></div>
              <p className="col-span-2 text-xs text-muted-foreground">Lascia entrambi vuoti per "Paziente Sconosciuto". Cognome intero + Nome intero → crea/collega cartella. Se uno dei due è un'iniziale (es. "M." o "R."), l'intervento resta senza cartella ma mostra il nome digitato.</p>
            </div>
            <div className="space-y-2">
              <Label>Evento</Label>
              <Popover open={eiTypeOpen} onOpenChange={setEiTypeOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" role="combobox" className="w-full justify-between">
                    {eiTypeSel === "__altro" ? "Altro…" : (eiTypeSel || "Seleziona evento...")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Cerca evento..." />
                    <CommandList onWheel={(e) => { e.currentTarget.scrollTop += e.deltaY; }}>
                      <CommandEmpty>Nessun risultato. Usa "Altro" per inserire un evento personalizzato.</CommandEmpty>
                      {(() => {
                        const sortIt = (a: IType, b: IType) => a.name.localeCompare(b.name, "it", { sensitivity: "base" });
                        const parents = types.filter((t) => !t.parent_id).sort(sortIt);
                        const childrenOf = (pid: string) => types.filter((t) => t.parent_id === pid).sort(sortIt);
                        const flatParents = parents.filter((p) => childrenOf(p.id).length === 0);
                        const groupedParents = parents.filter((p) => childrenOf(p.id).length > 0);
                        return (
                          <>
                            {flatParents.length > 0 && (
                              <CommandGroup>
                                {flatParents.map((t) => (
                                  <CommandItem key={t.id} value={t.name} onSelect={() => { setEiTypeSel(t.name); setEiTypeOpen(false); }}>
                                    <Check className={cn("mr-2 h-4 w-4", eiTypeSel === t.name ? "opacity-100" : "opacity-0")} />
                                    {t.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                            {groupedParents.map((p) => (
                              <CommandGroup key={p.id} heading={p.name}>
                                <CommandItem value={`${p.name} generico`} onSelect={() => { setEiTypeSel(p.name); setEiTypeOpen(false); }}>
                                  <Check className={cn("mr-2 h-4 w-4", eiTypeSel === p.name ? "opacity-100" : "opacity-0")} />
                                  <span className="text-muted-foreground">{p.name} (generico)</span>
                                </CommandItem>
                                {childrenOf(p.id).map((c) => (
                                  <CommandItem key={c.id} value={`${p.name} ${c.name}`} onSelect={() => { setEiTypeSel(c.name); setEiTypeOpen(false); }}>
                                    <Check className={cn("mr-2 h-4 w-4", eiTypeSel === c.name ? "opacity-100" : "opacity-0")} />
                                    {c.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            ))}
                            <CommandGroup>
                              <CommandItem value="__altro" onSelect={() => { setEiTypeSel("__altro"); setEiTypeOpen(false); }}>
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
                <Input placeholder="Scrivi l'evento" value={eiTypeOther} onChange={(e) => setEiTypeOther(e.target.value)} />
              )}
            </div>
            <div className="space-y-2"><Label>Data</Label><Input type="datetime-local" value={eiDate} onChange={(e) => setEiDate(e.target.value)} /></div>
            <VitalsTimelineEditor entries={eiVitals} onChange={setEiVitals} compact />

            <div className="space-y-2"><Label>Note</Label><Textarea value={eiNotes} onChange={(e) => setEiNotes(e.target.value)} rows={3} /></div>
            {isAdmin && (
              <div className="space-y-2">
                <Label>Operatore</Label>
                <Select value={eiOperator} onValueChange={setEiOperator}>
                  <SelectTrigger><SelectValue placeholder="Seleziona operatore" /></SelectTrigger>
                  <SelectContent>
                    {allUsernames.map((u) => (
                      <SelectItem key={u} value={u}>{formatOperator(u)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <label htmlFor="eppi" className={cn("flex items-center gap-3 rounded-xl border-2 p-3 cursor-pointer transition-all", eiPpi ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border/60 bg-card/40 hover:border-primary/50")}>
              <Checkbox id="eppi" checked={eiPpi} onCheckedChange={(v) => setEiPpi(!!v)} className="h-5 w-5" />
              <span className={cn("font-semibold text-sm", eiPpi && "text-primary")}>🏥 Invio in PPI</span>
            </label>
            <label htmlFor="efuori" className={cn("flex items-center gap-3 rounded-xl border-2 p-3 cursor-pointer transition-all", eiFuori ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30" : "border-border/60 bg-card/40 hover:border-amber-500/50")}>
              <Checkbox id="efuori" checked={eiFuori} onCheckedChange={(v) => setEiFuori(!!v)} className="h-5 w-5" />
              <span className={cn("font-semibold text-sm", eiFuori && "text-amber-600 dark:text-amber-400")}>🚑 Intervento fuori porta</span>
            </label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditInt(null)}>Annulla</Button><Button onClick={saveInt}>Salva</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View intervention (read-only, all users) */}
      <Dialog open={!!viewInt} onOpenChange={(o) => !o && setViewInt(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Dettaglio intervento</DialogTitle></DialogHeader>
          {viewInt && (() => {
            const p = viewInt.patient_id ? patients.find((x) => x.id === viewInt.patient_id) : null;
            const displayName = p ? `${p.last_name} ${p.first_name}` : ((viewInt as any).extra_data?.display_name ?? "Paziente Sconosciuto");
            const timeline = Array.isArray(viewInt.vitals_timeline) ? viewInt.vitals_timeline : [];
            return (
              <div className="space-y-3 text-sm">
                <div><span className="text-muted-foreground">Paziente:</span> <span className="font-medium">{displayName}</span></div>
                <div><span className="text-muted-foreground">Evento:</span> <span className="font-medium">{viewInt.intervention_type}</span></div>
                <div><span className="text-muted-foreground">Data:</span> {format(new Date(viewInt.intervention_date), "dd/MM/yyyy HH:mm")}</div>
                <div><span className="text-muted-foreground">Operatore:</span> {viewInt.operator_username ? (<span className="inline-flex items-center gap-1.5">{formatOperator(viewInt.operator_username)}<JobIcon username={viewInt.operator_username} /></span>) : "—"}</div>
                <div className="flex gap-4">
                  <div>🏥 PPI: <strong>{viewInt.invio_in_ppi ? "Sì" : "No"}</strong></div>
                  <div>🚑 Fuori porta: <strong>{viewInt.fuori_sede ? "Sì" : "No"}</strong></div>
                </div>
                {(vitalsLabel(viewInt) || timeline.length > 0) && (
                  <div className="rounded-lg border border-border/60 bg-card/60 p-3 space-y-1">
                    <div className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Parametri vitali</div>
                    {vitalsLabel(viewInt) && <div className="text-xs">T1 ({((viewInt as any).extra_data?.t1_at) || format(new Date(viewInt.intervention_date), "HH:mm")}): {vitalsLabel(viewInt)}</div>}
                    {timeline.map((t: any, idx: number) => {
                      const parts: string[] = [];
                      if (t.vs_pas != null || t.vs_pad != null) parts.push(`PA ${t.vs_pas ?? "-"}/${t.vs_pad ?? "-"}`);
                      if (t.vs_fc != null) parts.push(`FC ${t.vs_fc}`);
                      if (t.vs_spo2 != null) parts.push(`SpO₂ ${t.vs_spo2}`);
                      if (t.vs_temp != null) parts.push(`T ${t.vs_temp}°`);
                      if (t.vs_glicemia != null) parts.push(`Glic ${t.vs_glicemia}`);
                      return <div key={idx} className="text-xs">{t.label ?? `T${idx + 2}`}{t.at ? ` (${t.at})` : ""}: {parts.join(" · ") || "—"}</div>;
                    })}
                  </div>
                )}
                {viewInt.notes && (
                  <div>
                    <div className="text-muted-foreground text-xs uppercase tracking-wide">Note</div>
                    <div className="whitespace-pre-wrap">{viewInt.notes}</div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            {viewInt && (
              <Button
                variant="outline"
                onClick={async () => {
                  const p = viewInt.patient_id ? patients.find((x) => x.id === viewInt.patient_id) : null;
                  const name = p ? `${p.last_name} ${p.first_name}` : ((viewInt as any).extra_data?.display_name ?? "Paziente Sconosciuto");
                  try {
                    await generateClinicalPdf({ patientName: name, patient: p as any, interventions: [viewInt as any], single: true });
                  } catch (e: any) {
                    toast.error(e?.message ?? "Impossibile generare il PDF");
                  }
                }}
              >
                <FileDown className="h-4 w-4 mr-1" /> Referto PDF
              </Button>
            )}
            {viewInt && canEditInt(viewInt) && (
              <Button variant="outline" onClick={() => { const i = viewInt; setViewInt(null); openEditInt(i); }}>
                <Pencil className="h-4 w-4 mr-1" /> Modifica
              </Button>
            )}
            <Button onClick={() => setViewInt(null)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View patient folder (read-only, all users) */}
      <Dialog open={!!viewPatient} onOpenChange={(o) => !o && setViewPatient(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Cartella clinica</DialogTitle></DialogHeader>
          {viewPatient && (() => {
            const pInts = interventions.filter((i) => i.patient_id === viewPatient.id);
            return (
              <div className="space-y-3 text-sm">
                <div className="text-lg font-semibold">{viewPatient.last_name} {viewPatient.first_name}</div>
                <div className="text-xs text-muted-foreground">Creata il {format(new Date(viewPatient.created_at), "dd/MM/yyyy")} · {pInts.length} intervent{pInts.length === 1 ? "o" : "i"}</div>
                <div className="max-h-96 overflow-y-auto rounded-lg border border-border/60">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Data</TableHead><TableHead>Evento</TableHead><TableHead>Operatore</TableHead><TableHead>PPI</TableHead><TableHead>Fuori</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {pInts.map((i) => (
                        <TableRow key={i.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { setViewPatient(null); setViewInt(i); }}>
                          <TableCell>{format(new Date(i.intervention_date), "dd/MM/yyyy HH:mm")}</TableCell>
                          <TableCell>{i.intervention_type}</TableCell>
                          <TableCell><span className="inline-flex items-center gap-1.5">{formatOperator(i.operator_username)}<JobIcon username={i.operator_username} /></span></TableCell>
                          <TableCell>{i.invio_in_ppi ? "Sì" : "No"}</TableCell>
                          <TableCell>{i.fuori_sede ? "Sì" : "No"}</TableCell>
                        </TableRow>
                      ))}
                      {pInts.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nessun intervento</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })()}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            {viewPatient && (
              <Button
                variant="default"
                onClick={() => {
                  const p = viewPatient;
                  setViewPatient(null);
                  setFirstName(p.first_name);
                  setLastName(p.last_name);
                  setTimeout(() => {
                    const el = document.getElementById("intervention-form");
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }, 120);
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> Registra intervento
              </Button>
            )}
            {viewPatient && isAdmin && (
              <Button variant="outline" onClick={() => { const p = viewPatient; setViewPatient(null); openEditPatient(p); }}>
                <Pencil className="h-4 w-4 mr-1" /> Modifica
              </Button>
            )}
            <Button variant="ghost" onClick={() => setViewPatient(null)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {user && <FirstAccessFlow userId={user.id} />}
      {user && <NotifPermissionPrompt />}
      {user && <ProfileDialog userId={user.id} open={profileOpen} onOpenChange={setProfileOpen} />}
    </div>
  );
}

