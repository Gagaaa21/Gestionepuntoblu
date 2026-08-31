import { BackTile } from "@/components/BackHome";
import { PageHeader } from "@/components/PageHeader";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { exportSportXLSX, assetLabel } from "@/lib/xlsx-sport";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Plus, Trash2, Pencil, FileDown, FileUp, Sparkles, Truck,
  CheckCircle2, AlertTriangle, Paperclip, Download, X, Search, Euro, Clock,
  LayoutGrid, Table2, CalendarDays, Filter, SendHorizonal, Wand2,
} from "lucide-react";
import { RouteVisibilityGate } from "@/components/RouteVisibilityGate";
import { parseSportServices, sportInsight, sportAsk, sportCrewSuggest } from "@/lib/api/sport.functions";
import { CrewInput } from "@/components/sport/CrewInput";
import { ShiftsEditor, emptyChange, type CrewChange } from "@/components/sport/ShiftsEditor";
import { SportTable } from "@/components/sport/SportTable";
import { SportCalendar } from "@/components/sport/SportCalendar";
import { AiReport } from "@/components/sport/AiReport";
import logoSogit from "@/assets/logo-sogit.jpg.asset.json";


export const Route = createFileRoute("/servizi-sportivi")({
  head: () => ({
    meta: [
      { title: "Servizi sportivi · Punto Blu" },
      { name: "description", content: "Pianificazione dei servizi sportivi: eventi, mezzi, equipaggi, turni e materiali." },
      { property: "og:url", content: "https://your-domain.example/servizi-sportivi" },
      { property: "og:title", content: "Servizi sportivi · Punto Blu" },
      { property: "og:description", content: "Pianificazione dei servizi sportivi: eventi, mezzi, equipaggi, turni e materiali." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Servizi sportivi · Punto Blu" },
      { name: "twitter:description", content: "Pianificazione dei servizi sportivi: eventi, mezzi, equipaggi, turni e materiali." },
    ],
    links: [{ rel: "canonical", href: "https://your-domain.example/servizi-sportivi" }],
  }),
  component: Page,
});

type Asset = {
  type: string; vehicle_code: string; crew: number | string; driver: string; rescuers: string;
  start_time?: string | null; end_time?: string | null;
};
type Service = {
  id: string;
  event_date: string;
  event_name: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  assets: Asset[];
  crew_changes: CrewChange[];
  doctor_name: string | null;
  meal_voucher: boolean;
  als_backpack: boolean;
  paid: boolean;
  color: string;
  notes: string | null;
  done: boolean;
  username: string | null;
};
type Vehicle = {
  id: string; code: string; label: string | null; kind: string;
  out_of_service: boolean; oos_from: string | null; oos_to: string | null; oos_reason: string | null;
};
type Attachment = { id: string; service_id: string; path: string; filename: string; mime_type: string | null; size_bytes: number | null };

const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const ASSET_TYPES = ["Ambulanza", "SAP", "Auto medica", "Moto medica", "Altro"];
const COLORS = [
  "#1e3a8a", "#2563eb", "#0ea5e9", "#0e7490", "#0f766e", "#047857", "#16a34a", "#65a30d",
  "#ca8a04", "#b45309", "#ea580c", "#dc2626", "#b91c1c", "#9f1239", "#be185d", "#db2777",
  "#a21caf", "#7e22ce", "#6d28d9", "#4f46e5", "#475569", "#334155", "#1f2937", "#78350f",
  "#f59e0b", "#facc15", "#4ade80", "#38bdf8", "#f472b6", "#a3a3a3",
];

const emptyAsset = (): Asset => ({ type: "Ambulanza", vehicle_code: "", crew: 2, driver: "", rescuers: "", start_time: "", end_time: "" });

const hhmm = (v: string | null) => (v ? v.slice(0, 5) : "");
const toMin = (t: string | null) => { const s = hhmm(t); if (!s) return null; const [h, m] = s.split(":").map(Number); return h * 60 + m; };

function overlaps(aS: number | null, aE: number | null, bS: number | null, bE: number | null) {
  if (aS == null || bS == null) return false;
  const ae = aE ?? aS + 60, be = bE ?? bS + 60;
  return aS < be && bS < ae;
}

function Page() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState<string>("");

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [services, setServices] = useState<Service[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [detail, setDetail] = useState<Service | null>(null);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [insight, setInsight] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const insightFn = useServerFn(sportInsight);
  const parseFn = useServerFn(parseSportServices);

  const load = async () => {
    const [{ data: svc }, { data: veh }] = await Promise.all([
      supabase.from("sport_services" as any).select("*").order("event_date", { ascending: false }),
      supabase.from("sport_vehicles" as any).select("*").order("sort_order").order("code"),
    ]);
    setServices(((svc as any) ?? []).map((s: any) => ({
      ...s,
      assets: Array.isArray(s.assets) ? s.assets : [],
      crew_changes: Array.isArray(s.crew_changes) ? s.crew_changes : [],
      paid: !!s.paid,
    })));

    setVehicles((veh as any) ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const u = sess.session?.user;
      if (!u) { navigate({ to: "/auth", replace: true }); return; }
      const { data: ok } = await supabase.rpc("has_sport_access" as any, { _uid: u.id });
      if (!ok) { toast.error("Accesso non autorizzato"); navigate({ to: "/dashboard", replace: true }); return; }
      const { data: prof } = await supabase.from("profiles" as any).select("username").eq("id", u.id).maybeSingle();
      setUserId(u.id);
      setUsername((prof as any)?.username ?? "");
      setReady(true);
      await load();
    })();
  }, []);

  const [query, setQuery] = useState("");
  const [view, setView] = useState<"cards" | "table" | "calendar">("cards");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fltStatus, setFltStatus] = useState<"all" | "done" | "todo">("all");
  const [fltPaid, setFltPaid] = useState<"all" | "yes" | "no">("all");
  const [fltVehicle, setFltVehicle] = useState("all");
  const [fltType, setFltType] = useState("all");
  const [fltPerson, setFltPerson] = useState("all");
  const [fltMeal, setFltMeal] = useState(false);
  const [fltAls, setFltAls] = useState(false);
  const [fltDoctor, setFltDoctor] = useState(false);
  const [fltFrom, setFltFrom] = useState("");
  const [fltTo, setFltTo] = useState("");
  const [fltAllMonths, setFltAllMonths] = useState(false);

  const resetFilters = () => {
    setFltStatus("all"); setFltPaid("all"); setFltVehicle("all"); setFltType("all"); setFltPerson("all");
    setFltMeal(false); setFltAls(false); setFltDoctor(false); setFltFrom(""); setFltTo(""); setFltAllMonths(false);
  };
  const activeFilters =
    (fltStatus !== "all" ? 1 : 0) + (fltPaid !== "all" ? 1 : 0) + (fltVehicle !== "all" ? 1 : 0) +
    (fltType !== "all" ? 1 : 0) + (fltPerson !== "all" ? 1 : 0) + (fltMeal ? 1 : 0) + (fltAls ? 1 : 0) +
    (fltDoctor ? 1 : 0) + (fltFrom ? 1 : 0) + (fltTo ? 1 : 0) + (fltAllMonths ? 1 : 0);

  /** Elenco di tutte le persone note (autisti + soccorritori + cambi turno) per autocomplete e filtro. */
  const people = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => {
      [...(s.assets ?? []), ...(s.crew_changes ?? [])].forEach((x: any) => {
        [x.driver, x.rescuers].filter(Boolean).forEach((v: string) =>
          String(v).split(",").map((n) => n.trim()).filter(Boolean).forEach((n) => set.add(n)),
        );
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [services]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasPerson = (s: Service, name: string) =>
      [...(s.assets ?? []), ...(s.crew_changes ?? [])].some((x: any) =>
        [x.driver, x.rescuers].filter(Boolean).join(",").toLowerCase().split(",").map((n: string) => n.trim()).includes(name.toLowerCase()),
      );
    return services
      .filter((s) => {
        if (fltAllMonths) return true;
        const d = new Date(s.event_date + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      })
      .filter((s) => (fltFrom ? s.event_date >= fltFrom : true))
      .filter((s) => (fltTo ? s.event_date <= fltTo : true))
      .filter((s) => (fltStatus === "all" ? true : fltStatus === "done" ? s.done : !s.done))
      .filter((s) => (fltPaid === "all" ? true : fltPaid === "yes" ? !!s.paid : !s.paid))
      .filter((s) => (fltVehicle === "all" ? true : (s.assets ?? []).some((a) => (a.vehicle_code || "").toUpperCase() === fltVehicle)))
      .filter((s) => (fltType === "all" ? true : (s.assets ?? []).some((a) => a.type === fltType)))
      .filter((s) => (fltPerson === "all" ? true : hasPerson(s, fltPerson)))
      .filter((s) => (fltMeal ? s.meal_voucher : true))
      .filter((s) => (fltAls ? s.als_backpack : true))
      .filter((s) => (fltDoctor ? !!s.doctor_name : true))
      .filter((s) => {
        if (!q) return true;
        const hay = [
          s.event_name, s.location, s.doctor_name, s.notes, s.event_date,
          ...(s.assets ?? []).flatMap((a) => [a.type, a.vehicle_code, a.driver, a.rescuers]),
          ...(s.crew_changes ?? []).flatMap((c) => [c.kind, c.vehicle_code, c.driver, c.rescuers, c.note]),
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.event_date.localeCompare(b.event_date) || (hhmm(a.start_time)).localeCompare(hhmm(b.start_time)));
  }, [services, year, month, query, fltAllMonths, fltFrom, fltTo, fltStatus, fltPaid, fltVehicle, fltType, fltPerson, fltMeal, fltAls, fltDoctor]);

  const yearOptions = useMemo(() => {
    const ys = new Set<number>([today.getFullYear()]);
    services.forEach((s) => ys.add(Number(s.event_date.slice(0, 4))));
    return Array.from(ys).sort((a, b) => b - a);
  }, [services]);

  const stats = useMemo(() => ({
    count: filtered.length,
    done: filtered.filter((s) => s.done).length,
    people: filtered.reduce((n, s) => n + s.assets.reduce((k, a) => k + (Number(a.crew) || 0), 0), 0),
    meals: filtered.filter((s) => s.meal_voucher).length,
    paid: filtered.filter((s) => s.paid).length,

  }), [filtered]);

  /* ------- rilevamento conflitti veicolo (AI/logica) ------- */
  const conflictsFor = (svc: Partial<Service> & { id?: string }): string[] => {
    const out: string[] = [];
    const codes = (svc.assets ?? []).map((a) => (a.vehicle_code || "").trim().toUpperCase()).filter(Boolean);
    if (!svc.event_date) return out;
    for (const code of codes) {
      const v = vehicles.find((x) => x.code.toUpperCase() === code);
      if (v?.out_of_service) {
        const from = v.oos_from ? new Date(v.oos_from) : null;
        const to = v.oos_to ? new Date(v.oos_to) : null;
        const d = new Date(svc.event_date + "T12:00:00");
        if ((!from || d >= from) && (!to || d <= to)) {
          out.push(`${code} risulta FUORI SERVIZIO${v.oos_reason ? ` (${v.oos_reason})` : ""}`);
        }
      }
      for (const other of services) {
        if (other.id === svc.id) continue;
        if (other.event_date !== svc.event_date) continue;
        const otherCodes = other.assets.map((a) => (a.vehicle_code || "").trim().toUpperCase());
        if (!otherCodes.includes(code)) continue;
        if (overlaps(toMin(svc.start_time ?? null), toMin(svc.end_time ?? null), toMin(other.start_time), toMin(other.end_time))) {
          out.push(`${code} è già impegnato in "${other.event_name}" (${hhmm(other.start_time)}–${hhmm(other.end_time)})`);
        }
      }
    }
    return out;
  };

  /* ------------------- FORM ------------------- */
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fName, setFName] = useState("");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fLoc, setFLoc] = useState("");
  const [fAssets, setFAssets] = useState<Asset[]>([emptyAsset()]);
  const [fChanges, setFChanges] = useState<CrewChange[]>([]);
  const [fDoctor, setFDoctor] = useState("");
  const [fMeal, setFMeal] = useState(false);
  const [fAls, setFAls] = useState(false);
  const [fPaid, setFPaid] = useState(false);
  const [fColor, setFColor] = useState(COLORS[0]);
  const [fNotes, setFNotes] = useState("");
  const [fDone, setFDone] = useState(false);

  const openNew = () => {
    setEditing(null);
    setFDate(new Date().toISOString().slice(0, 10));
    setFName(""); setFStart(""); setFEnd(""); setFLoc("");
    setFAssets([emptyAsset()]); setFChanges([]); setFDoctor(""); setFMeal(false); setFAls(false); setFPaid(false);
    setFColor(COLORS[0]); setFNotes(""); setFDone(false);
    setFormOpen(true);
  };
  const openEdit = (s: Service) => {
    setEditing(s);
    setFDate(s.event_date); setFName(s.event_name);
    setFStart(hhmm(s.start_time)); setFEnd(hhmm(s.end_time));
    setFLoc(s.location ?? "");
    setFAssets(s.assets.length ? s.assets.map((a) => ({ ...a, start_time: hhmm(a.start_time ?? null), end_time: hhmm(a.end_time ?? null) })) : [emptyAsset()]);
    setFChanges((s.crew_changes ?? []).map((c) => ({ ...emptyChange(), ...c, time: hhmm(c.time ?? null) })));
    setFDoctor(s.doctor_name ?? ""); setFMeal(s.meal_voucher); setFAls(s.als_backpack); setFPaid(!!s.paid);
    setFColor(s.color || COLORS[0]); setFNotes(s.notes ?? ""); setFDone(s.done);
    setFormOpen(true);
  };

  const formConflicts = useMemo(() => conflictsFor({
    id: editing?.id, event_date: fDate, start_time: fStart || null, end_time: fEnd || null, assets: fAssets,
  }), [fDate, fStart, fEnd, fAssets, services, vehicles, editing]);

  const saveService = async () => {
    if (!fName.trim()) return toast.error("Inserisci il nome dell'evento");
    if (!fDate) return toast.error("Inserisci la data");
    const payload = {
      event_date: fDate,
      event_name: fName.trim(),
      start_time: fStart || null,
      end_time: fEnd || null,
      location: fLoc.trim() || null,
      assets: fAssets
        .filter((a) => a.type || a.vehicle_code || a.driver || a.rescuers)
        .map((a) => ({
          ...a,
          vehicle_code: (a.vehicle_code || "").trim().toUpperCase(),
          crew: Number(a.crew) || 0,
          start_time: a.start_time || null,
          end_time: a.end_time || null,
        })),
      crew_changes: fChanges
        .filter((c) => c.time || c.driver || c.rescuers || c.note)
        .map((c) => ({ ...c, vehicle_code: (c.vehicle_code || "").trim().toUpperCase() })),
      doctor_name: fDoctor.trim() || null,
      meal_voucher: fMeal,
      als_backpack: fAls,
      paid: fPaid,
      color: fColor,
      notes: fNotes.trim() || null,
      done: fDone,

    };
    if (editing) {
      const { error } = await supabase.from("sport_services" as any).update(payload as any).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Servizio aggiornato");
    } else {
      const { error } = await supabase.from("sport_services" as any)
        .insert({ ...payload, created_by: userId, username } as any);
      if (error) return toast.error(error.message);
      toast.success("Servizio registrato");
    }
    setFormOpen(false);
    load();
  };

  const toggleDone = async (s: Service, done: boolean) => {
    const { error } = await supabase.from("sport_services" as any).update({ done } as any).eq("id", s.id);
    if (error) return toast.error(error.message);
    setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, done } : x)));
  };

  const togglePaid = async (s: Service, paid: boolean) => {
    const { error } = await supabase.from("sport_services" as any).update({ paid } as any).eq("id", s.id);
    if (error) return toast.error(error.message);
    setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, paid } : x)));
    setDetail((d) => (d && d.id === s.id ? { ...d, paid } : d));
  };

  const markSelectedPaid = async (paid: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 25) {
      const { error } = await supabase.from("sport_services" as any).update({ paid } as any).in("id", ids.slice(i, i + 25));
      if (error) { toast.error(error.message); return; }
    }
    setSelected(new Set());
    toast.success(paid ? "Segnati come pagati" : "Segnati come non pagati");
    load();
  };


  const removeSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Eliminare ${ids.length} servizi selezionati?`)) return;
    for (let i = 0; i < ids.length; i += 25) {
      const { error } = await supabase.from("sport_services" as any).delete().in("id", ids.slice(i, i + 25));
      if (error) { toast.error(error.message); return; }
    }
    setSelected(new Set());
    toast.success("Servizi eliminati");
    load();
  };
  const markSelectedDone = async (done: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 25) {
      const { error } = await supabase.from("sport_services" as any).update({ done } as any).in("id", ids.slice(i, i + 25));
      if (error) { toast.error(error.message); return; }
    }
    setSelected(new Set());
    toast.success(done ? "Segnati come svolti" : "Segnati come da svolgere");
    load();
  };

  /* ------------------- EXPORT ------------------- */
  const exportXLSX = async () => {
    try {
      await exportSportXLSX({
        rows: filtered as any,
        monthLabel: MONTHS[month - 1],
        year,
        filename: `servizi-sportivi-${year}-${String(month).padStart(2, "0")}.xlsx`,
      });
    } catch (e: any) {
      toast.error(e?.message || "Errore durante l'esportazione");
    }
  };


  /* ------------------- AI ------------------- */
  const runInsight = async () => {
    setAiLoading(true);
    try {
      const r: any = await insightFn({ data: { year, month } });
      setInsight(r.text);
    } catch (e: any) { toast.error(e.message || "Errore AI"); }
    finally { setAiLoading(false); }
  };

  const askFn = useServerFn(sportAsk);
  const crewFn = useServerFn(sportCrewSuggest);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askAllYear, setAskAllYear] = useState(false);
  const [crewLoading, setCrewLoading] = useState(false);
  const [crewReason, setCrewReason] = useState("");

  const runAsk = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text);
    setAskLoading(true);
    setAnswer("");
    try {
      const r: any = await askFn({ data: { question: text, year, month, allYear: askAllYear } });
      setAnswer(r.text);
    } catch (e: any) { toast.error(e.message || "Errore AI"); }
    finally { setAskLoading(false); }
  };

  const suggestCrew = async () => {
    setCrewLoading(true);
    setCrewReason("");
    try {
      const r: any = await crewFn({
        data: { event_date: fDate, start_time: fStart || null, end_time: fEnd || null, event_name: fName, assets: fAssets },
      });
      if (!r.assets?.length) { toast.error("Nessun suggerimento disponibile"); setCrewReason(r.reason || ""); return; }
      setFAssets((prev) => {
        const next = [...prev];
        r.assets.forEach((sug: any, i: number) => {
          const idx = next.findIndex((a) => (a.vehicle_code || "").toUpperCase() === String(sug.vehicle_code || "").toUpperCase());
          const target = idx >= 0 ? idx : i;
          if (!next[target]) next[target] = emptyAsset();
          next[target] = {
            ...next[target],
            vehicle_code: (sug.vehicle_code || next[target].vehicle_code || "").toUpperCase(),
            crew: Number(sug.crew) || next[target].crew,
            driver: sug.driver || next[target].driver,
            rescuers: sug.rescuers || next[target].rescuers,
          };
        });
        return next;
      });
      setCrewReason(r.reason || "");
      toast.success("Equipaggi suggeriti");
    } catch (e: any) { toast.error(e.message || "Errore AI"); }
    finally { setCrewLoading(false); }
  };



  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const runImport = async (file?: File) => {
    setImportLoading(true);
    try {
      let payload: any = { text: importText };
      if (file) {
        const b64 = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(",")[1] ?? "");
          fr.onerror = rej;
          fr.readAsDataURL(file);
        });
        payload = { text: importText || undefined, fileBase64: b64, filename: file.name, mimeType: file.type };
      }
      const r: any = await parseFn({ data: payload });
      if (!r.rows?.length) { toast.error("Nessun servizio riconosciuto"); setImportRows([]); }
      else { setImportRows(r.rows); toast.success(`${r.rows.length} servizi riconosciuti`); }
    } catch (e: any) { toast.error(e.message || "Errore import AI"); }
    finally { setImportLoading(false); }
  };

  const confirmImport = async () => {
    const payload = importRows.map((r: any) => ({
      event_date: r.event_date,
      event_name: r.event_name || "Servizio",
      start_time: r.start_time || null,
      end_time: r.end_time || null,
      location: r.location || null,
      assets: Array.isArray(r.assets) ? r.assets.map((a: any) => ({
        type: a.type || "Ambulanza", vehicle_code: (a.vehicle_code || "").toUpperCase(),
        crew: Number(a.crew) || 2, driver: a.driver || "", rescuers: a.rescuers || "",
        start_time: a.start_time || null, end_time: a.end_time || null,
      })) : [],
      crew_changes: [],
      doctor_name: r.doctor_name || null,
      meal_voucher: !!r.meal_voucher,
      als_backpack: !!r.als_backpack,
      paid: false,
      color: COLORS[0],
      notes: r.notes || null,
      done: false,

      created_by: userId,
      username,
    })).filter((r) => r.event_date);
    if (!payload.length) return toast.error("Nessuna riga valida");
    const { error } = await supabase.from("sport_services" as any).insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success(`${payload.length} servizi importati`);
    setImportOpen(false); setImportRows([]); setImportText("");
    load();
  };

  /* ------------------- ALLEGATI ------------------- */
  const [files, setFiles] = useState<Attachment[]>([]);
  const attRef = useRef<HTMLInputElement>(null);
  const loadFiles = async (serviceId: string) => {
    const { data } = await supabase.from("sport_service_files" as any).select("*").eq("service_id", serviceId).order("created_at");
    setFiles((data as any) ?? []);
  };
  const openDetail = async (s: Service) => { setDetail(s); await loadFiles(s.id); };
  const uploadFiles = async (list: FileList | null) => {
    if (!list || !detail) return;
    for (const f of Array.from(list)) {
      const path = `${detail.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("sport-files").upload(path, f);
      if (error) { toast.error(error.message); continue; }
      await supabase.from("sport_service_files" as any).insert({
        service_id: detail.id, path, filename: f.name, mime_type: f.type, size_bytes: f.size, uploaded_by: userId,
      } as any);
    }
    toast.success("Allegati caricati");
    loadFiles(detail.id);
  };
  const downloadFile = async (a: Attachment) => {
    const { data, error } = await supabase.storage.from("sport-files").createSignedUrl(a.path, 60);
    if (error || !data) return toast.error("Impossibile aprire il file");
    window.open(data.signedUrl, "_blank");
  };
  const deleteFile = async (a: Attachment) => {
    await supabase.storage.from("sport-files").remove([a.path]);
    await supabase.from("sport_service_files" as any).delete().eq("id", a.id);
    loadFiles(a.service_id);
  };

  /* ------------------- VEICOLI ------------------- */
  const [vCode, setVCode] = useState("");
  const [vLabel, setVLabel] = useState("");
  const addVehicle = async () => {
    const code = vCode.trim().toUpperCase();
    if (!code) return;
    const { error } = await supabase.from("sport_vehicles" as any).insert({ code, label: vLabel.trim() || null } as any);
    if (error) return toast.error(error.message);
    setVCode(""); setVLabel(""); load();
  };
  const updateVehicle = async (id: string, patch: Partial<Vehicle>) => {
    const { error } = await supabase.from("sport_vehicles" as any).update(patch as any).eq("id", id);
    if (error) return toast.error(error.message);
    setVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } as Vehicle : v)));
  };
  const deleteVehicle = async (id: string) => {
    if (!confirm("Eliminare il veicolo?")) return;
    const { error } = await supabase.from("sport_vehicles" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-background">
      <RouteVisibilityGate path="/servizi-sportivi" />
      <PageHeader
        icon={<Truck className="h-5 w-5" />}
        eyebrow="S.O.G.IT. Lignano"
        title="Servizi sportivi"
        subtitle="Gestione eventi e mezzi"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setVehiclesOpen(true)}><Truck className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Veicoli</span></Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Import AI</span></Button>
            <Button variant="outline" size="sm" onClick={exportXLSX}><FileDown className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Excel</span></Button>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Nuovo</span></Button>
          </>
        }
      />

      <main className="container mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca evento, luogo, mezzo, autista…"
              className="pl-9"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Pulisci ricerca"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground ml-auto">
            <span><b className="text-foreground">{stats.count}</b> servizi</span>
            <span><b className="text-foreground">{stats.done}</b> svolti</span>
            <span><b className="text-foreground">{stats.people}</b> persone impiegate</span>
            <span><b className="text-foreground">{stats.meals}</b> con buono pasto</span>
            <span><b className="text-foreground">{stats.paid}</b> pagati</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5">
            {([
              ["cards", "Schede", LayoutGrid],
              ["table", "Tabella", Table2],
              ["calendar", "Calendario", CalendarDays],
            ] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
          <Button variant={activeFilters ? "default" : "outline"} size="sm" onClick={() => setFiltersOpen((o) => !o)}>
            <Filter className="h-4 w-4 mr-1" />Filtri{activeFilters ? ` (${activeFilters})` : ""}
          </Button>
          {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={resetFilters}><X className="h-4 w-4 mr-1" />Azzera</Button>}
        </div>

        {filtersOpen && (
          <div className="rounded-xl border bg-muted/30 p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Stato</Label>
              <Select value={fltStatus} onValueChange={(v) => setFltStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="done">Svolti</SelectItem>
                  <SelectItem value="todo">Da svolgere</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pagamento</Label>
              <Select value={fltPaid} onValueChange={(v) => setFltPaid(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="yes">Pagati</SelectItem>
                  <SelectItem value="no">Non pagati</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mezzo</Label>
              <Select value={fltVehicle} onValueChange={setFltVehicle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i mezzi</SelectItem>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.code.toUpperCase()}>{v.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo mezzo</Label>
              <Select value={fltType} onValueChange={setFltType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i tipi</SelectItem>
                  {ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Persona</Label>
              <Select value={fltPerson} onValueChange={setFltPerson}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">Tutte</SelectItem>
                  {people.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dal</Label>
              <Input type="date" value={fltFrom} onChange={(e) => setFltFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Al</Label>
              <Input type="date" value={fltTo} onChange={(e) => setFltTo(e.target.value)} />
            </div>
            <div className="space-y-2 pt-5 text-sm">
              <label className="flex items-center gap-2"><Switch checked={fltMeal} onCheckedChange={(v) => setFltMeal(!!v)} />Solo con buono pasto</label>
              <label className="flex items-center gap-2"><Switch checked={fltAls} onCheckedChange={(v) => setFltAls(!!v)} />Solo con zaino ALS</label>
              <label className="flex items-center gap-2"><Switch checked={fltDoctor} onCheckedChange={(v) => setFltDoctor(!!v)} />Solo con medico</label>
              <label className="flex items-center gap-2"><Switch checked={fltAllMonths} onCheckedChange={(v) => setFltAllMonths(!!v)} />Ignora il mese (tutti i servizi)</label>
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Assistente AI</CardTitle>
              <CardDescription>Analizza il periodo, trova sovrapposizioni mezzi e rispondi a domande sui servizi</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={askAllYear} onCheckedChange={(v) => setAskAllYear(!!v)} />Tutto l'anno
              </label>
              <Button variant="outline" size="sm" onClick={runInsight} disabled={aiLoading}>
                {aiLoading ? "Analisi…" : "Analizza mese"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runAsk(); }}
                placeholder="Chiedi: quante ore ha fatto Mario? Quali mezzi sono liberi sabato?"
              />
              <Button onClick={() => runAsk()} disabled={askLoading || !question.trim()}>
                <SendHorizonal className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                "Chi ha lavorato di più?",
                "Ci sono sovrapposizioni di mezzi?",
                "Quali servizi non sono ancora stati pagati?",
                "Quali turni sono scoperti o incompleti?",
                "Riassumi il carico per mezzo",
              ].map((q) => (
                <button key={q} type="button" onClick={() => runAsk(q)}
                  className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted">
                  {q}
                </button>
              ))}
            </div>
            {askLoading && <p className="text-sm text-muted-foreground">L'assistente sta ragionando…</p>}
            {answer && <AiReport text={answer} title="Risposta" />}
            {insight && <AiReport text={insight} title={`Analisi ${MONTHS[month - 1]} ${year}`} />}
          </CardContent>
        </Card>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
            <span className="text-sm">{selected.size} selezionati</span>
            <Button size="sm" variant="outline" onClick={() => markSelectedDone(true)}><CheckCircle2 className="h-4 w-4 mr-2" />Segna svolti</Button>
            <Button size="sm" variant="outline" onClick={() => markSelectedDone(false)}>Segna da svolgere</Button>
            <Button size="sm" variant="outline" onClick={() => markSelectedPaid(true)}><Euro className="h-4 w-4 mr-2" />Segna pagati</Button>
            <Button size="sm" variant="outline" onClick={() => markSelectedPaid(false)}>Segna non pagati</Button>
            <Button size="sm" variant="destructive" onClick={removeSelected}><Trash2 className="h-4 w-4 mr-2" />Elimina</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X className="h-4 w-4" /></Button>
          </div>
        )}

        {filtered.length === 0 && view !== "calendar" && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {query || activeFilters ? "Nessun servizio corrisponde ai criteri selezionati." : `Nessun servizio in ${MONTHS[month - 1]} ${year}.`}
          </p>
        )}

        {view === "cards" && (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((s) => {
            const confl = conflictsFor(s);
            return (
              <div key={s.id} className="rounded-xl border bg-card overflow-hidden flex" style={{ borderColor: `${s.color}55` }}>
                <div className="w-1.5 shrink-0" style={{ background: s.color }} />
                <div className="flex-1 p-4 space-y-2" style={{ background: `${s.color}0f` }}>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={selected.has(s.id)}
                      onCheckedChange={(v) => setSelected((prev) => {
                        const n = new Set(prev); v ? n.add(s.id) : n.delete(s.id); return n;
                      })}
                    />
                    <button className="text-left flex-1" onClick={() => openDetail(s)}>
                      <div className="font-medium leading-tight">{s.event_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.event_date + "T00:00:00").toLocaleDateString("it-IT")} · {hhmm(s.start_time) || "—"}–{hhmm(s.end_time) || "—"}
                        {s.location ? ` · ${s.location}` : ""}
                      </div>
                    </button>
                    <div className="flex flex-col items-end gap-1">
                      {s.done && <span className="text-[11px] rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">Svolto</span>}
                      {s.paid && <span className="text-[11px] rounded-full bg-sky-100 text-sky-800 px-2 py-0.5">Pagato</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {s.assets.map((a, i) => (
                      <span key={i} className="rounded-md border bg-background/70 px-2 py-0.5">
                        {assetLabel(a)} · {a.crew || "?"}p
                      </span>
                    ))}
                    {(s.crew_changes ?? []).length > 0 && (
                      <span className="rounded-md border bg-background/70 px-2 py-0.5 inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />{s.crew_changes.length} cambi
                      </span>
                    )}
                    {s.doctor_name && <span className="rounded-md border bg-background/70 px-2 py-0.5">Medico: {s.doctor_name}</span>}
                    {s.meal_voucher && <span className="rounded-md border bg-background/70 px-2 py-0.5">Buono pasto</span>}
                    {s.als_backpack && <span className="rounded-md border bg-background/70 px-2 py-0.5">Zaino ALS</span>}
                  </div>
                  {confl.length > 0 && (
                    <div className="text-[11px] text-amber-700 flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{confl.join(" · ")}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 pt-1 flex-wrap">
                    <div className="flex items-center gap-2 text-xs">
                      <Switch checked={s.done} onCheckedChange={(v) => toggleDone(s, !!v)} />
                      <span className="text-muted-foreground">Svolto</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Switch checked={!!s.paid} onCheckedChange={(v) => togglePaid(s, !!v)} />
                      <span className="text-muted-foreground">Pagato</span>
                    </div>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => openDetail(s)}><Paperclip className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
        )}

        {view === "table" && (
          <SportTable
            rows={filtered}
            selected={selected}
            onToggleSelect={(id, on) => setSelected((prev) => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n; })}
            onOpen={openDetail}
            onEdit={openEdit}
          />
        )}

        {view === "calendar" && (
          <SportCalendar rows={filtered} year={year} month={month} onOpen={openDetail} />
        )}
      </main>

      {/* ---------- FORM ---------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica servizio" : "Nuovo servizio sportivo"}</DialogTitle>
            <DialogDescription>Compila i dati dell'evento e dei mezzi impiegati.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <section className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">1 · Evento</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Data evento</Label><Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} /></div>
                <div className="space-y-1"><Label>Nome evento</Label><Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="es. Torneo calcio Lignano" /></div>
                <div className="space-y-1"><Label>Ora inizio</Label><Input type="time" value={fStart} onChange={(e) => setFStart(e.target.value)} /></div>
                <div className="space-y-1"><Label>Ora fine</Label><Input type="time" value={fEnd} onChange={(e) => setFEnd(e.target.value)} /></div>
                <div className="space-y-1 sm:col-span-2"><Label>Location</Label><Input value={fLoc} onChange={(e) => setFLoc(e.target.value)} placeholder="es. Stadio Comunale, Lignano Sabbiadoro" /></div>
              </div>
            </section>

            <section className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">2 · Mezzi ed equipaggi</div>
                  <p className="text-xs text-muted-foreground">Un blocco per ogni mezzo impiegato.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setFAssets((p) => [...p, emptyAsset()])}><Plus className="h-4 w-4 mr-1" />Aggiungi mezzo</Button>
              </div>
              {fAssets.map((a, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-4">
                    <Select value={a.type} onValueChange={(v) => setFAssets((p) => p.map((x, k) => k === i ? { ...x, type: v } : x))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={a.vehicle_code || "__none"} onValueChange={(v) => setFAssets((p) => p.map((x, k) => k === i ? { ...x, vehicle_code: v === "__none" ? "" : v } : x))}>
                      <SelectTrigger><SelectValue placeholder="Veicolo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Nessun veicolo</SelectItem>
                        {vehicles.map((v) => <SelectItem key={v.id} value={v.code}>{v.code}{v.out_of_service ? " (fuori servizio)" : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" min={1} value={a.crew} onChange={(e) => setFAssets((p) => p.map((x, k) => k === i ? { ...x, crew: e.target.value } : x))} placeholder="Persone" />
                    <Button variant="ghost" onClick={() => setFAssets((p) => p.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Arrivo mezzo (scaglionato)</Label>
                      <Input type="time" value={a.start_time || ""} onChange={(e) => setFAssets((p) => p.map((x, k) => k === i ? { ...x, start_time: e.target.value } : x))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Fine mezzo</Label>
                      <Input type="time" value={a.end_time || ""} onChange={(e) => setFAssets((p) => p.map((x, k) => k === i ? { ...x, end_time: e.target.value } : x))} />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Autista</Label>
                      <CrewInput
                        single
                        value={a.driver}
                        suggestions={people}
                        placeholder="Nome autista"
                        onChange={(v) => setFAssets((p) => p.map((x, k) => k === i ? { ...x, driver: v } : x))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Soccorritori</Label>
                      <CrewInput
                        value={a.rescuers}
                        suggestions={people}
                        placeholder="Aggiungi soccorritore…"
                        onChange={(v) => setFAssets((p) => p.map((x, k) => k === i ? { ...x, rescuers: v } : x))}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {formConflicts.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                  <div className="flex items-center gap-1 font-medium"><AlertTriangle className="h-4 w-4" />Attenzione mezzi</div>
                  {formConflicts.map((c, i) => <div key={i}>• {c}</div>)}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={suggestCrew} disabled={crewLoading}>
                  <Wand2 className="h-4 w-4 mr-1" />{crewLoading ? "Suggerimento…" : "Suggerisci equipaggi con AI"}
                </Button>
                {crewReason && <span className="text-xs text-muted-foreground">{crewReason}</span>}
              </div>
            </section>

            <section className="rounded-xl border bg-muted/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">3 · Turni</div>
              <ShiftsEditor
                changes={fChanges}
                onChange={setFChanges}
                assets={fAssets as any}
                vehicles={vehicles}
                people={people}
                serviceStart={fStart}
                serviceEnd={fEnd}
              />
            </section>

            <section className="rounded-xl border bg-muted/20 p-4 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">4 · Dettagli e stato</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Medico (se presente)</Label><Input value={fDoctor} onChange={(e) => setFDoctor(e.target.value)} placeholder="Nome medico" /></div>
                <div className="space-y-1">
                  <Label>Colore servizio</Label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setFColor(c)}
                        className={`h-7 w-7 rounded-full border-2 ${fColor === c ? "border-foreground" : "border-transparent"}`}
                        style={{ background: c }} aria-label={c} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm rounded-lg border bg-background px-3 py-2"><Switch checked={fMeal} onCheckedChange={(v) => setFMeal(!!v)} />Buono pasto</label>
                <label className="flex items-center gap-2 text-sm rounded-lg border bg-background px-3 py-2"><Switch checked={fAls} onCheckedChange={(v) => setFAls(!!v)} />Zaino ALS</label>
                <label className="flex items-center gap-2 text-sm rounded-lg border bg-background px-3 py-2"><Switch checked={fDone} onCheckedChange={(v) => setFDone(!!v)} />Già svolto</label>
                <label className="flex items-center gap-2 text-sm rounded-lg border bg-background px-3 py-2"><Switch checked={fPaid} onCheckedChange={(v) => setFPaid(!!v)} />Pagato</label>
              </div>

              <div className="space-y-1"><Label>Note</Label><Textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={3} placeholder="Annotazioni sul servizio…" /></div>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Annulla</Button>
            <Button onClick={saveService}>{editing ? "Salva modifiche" : "Registra servizio"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- DETTAGLIO + ALLEGATI ---------- */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setFiles([]); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: detail.color }} />
                  {detail.event_name}
                </DialogTitle>
                <DialogDescription>
                  {new Date(detail.event_date + "T00:00:00").toLocaleDateString("it-IT")} · {hhmm(detail.start_time) || "—"}–{hhmm(detail.end_time) || "—"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div><b>Location:</b> {detail.location || "—"}</div>
                <div className="space-y-2">
                  <b>Mezzi ed equipaggi</b>
                  {detail.assets.length === 0 && <div className="text-muted-foreground">Nessun mezzo indicato</div>}
                  {detail.assets.map((a, i) => (
                    <div key={i} className="rounded-lg border p-2">
                      <div className="font-medium">
                        {a.type} {a.vehicle_code}
                        {(a.start_time || a.end_time) && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {hhmm(a.start_time ?? null) || "—"}–{hhmm(a.end_time ?? null) || "—"}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Equipaggio: {a.crew || "—"} · Autista: {a.driver || "—"} · Soccorritori: {a.rescuers || "—"}
                      </div>
                    </div>
                  ))}
                </div>
                {(detail.crew_changes ?? []).length > 0 && (
                  <div className="space-y-2">
                    <b>Cambi equipaggio</b>
                    {detail.crew_changes.map((c, i) => (
                      <div key={i} className="rounded-lg border p-2 text-xs">
                        <div className="font-medium text-sm">{hhmm(c.time ?? null) || "—"}{c.end_time ? `–${hhmm(c.end_time)}` : ""} · {c.kind}{c.vehicle_code ? ` · ${c.vehicle_code}` : ""}</div>
                        <div className="text-muted-foreground">
                          Autista: {c.driver || "—"} · Soccorritori: {c.rescuers || "—"}{c.note ? ` · ${c.note}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div><b>Medico:</b> {detail.doctor_name || "—"}</div>
                <div><b>Buono pasto:</b> {detail.meal_voucher ? "Sì" : "No"} · <b>Zaino ALS:</b> {detail.als_backpack ? "Sì" : "No"}</div>
                <div className="flex flex-wrap items-center gap-4">
                  <span><b>Stato:</b> {detail.done ? "Svolto" : "Da svolgere"}</span>
                  <label className="flex items-center gap-2"><Switch checked={!!detail.paid} onCheckedChange={(v) => togglePaid(detail, !!v)} />Pagato</label>
                </div>
                {detail.notes && <div><b>Note:</b> {detail.notes}</div>}


                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <b>Allegati</b>
                    <Button size="sm" variant="outline" onClick={() => attRef.current?.click()}><Paperclip className="h-4 w-4 mr-1" />Carica</Button>
                    <input ref={attRef} type="file" multiple className="hidden" onChange={(e) => { uploadFiles(e.target.files); e.currentTarget.value = ""; }} />
                  </div>
                  {files.length === 0 && <div className="text-xs text-muted-foreground">Nessun allegato.</div>}
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                      <span className="flex-1 truncate">{f.filename}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadFile(f)}><Download className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteFile(f)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="destructive" onClick={async () => {
                  if (!confirm("Eliminare questo servizio?")) return;
                  await supabase.from("sport_services" as any).delete().eq("id", detail.id);
                  setDetail(null); load(); toast.success("Servizio eliminato");
                }}><Trash2 className="h-4 w-4 mr-2" />Elimina</Button>
                <Button variant="outline" onClick={() => { const s = detail; setDetail(null); if (s) openEdit(s); }}><Pencil className="h-4 w-4 mr-2" />Modifica</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- VEICOLI ---------- */}
      <Dialog open={vehiclesOpen} onOpenChange={setVehiclesOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Veicoli</DialogTitle>
            <DialogDescription>Gestisci i mezzi (M12, M23, M30…) e lo stato di fuori servizio.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1"><Label className="text-xs">Sigla</Label><Input className="w-28" value={vCode} onChange={(e) => setVCode(e.target.value)} placeholder="M12" /></div>
            <div className="space-y-1 flex-1 min-w-40"><Label className="text-xs">Descrizione</Label><Input value={vLabel} onChange={(e) => setVLabel(e.target.value)} placeholder="Ambulanza Fiat Ducato" /></div>
            <Button onClick={addVehicle}><Plus className="h-4 w-4 mr-1" />Aggiungi</Button>
          </div>
          <div className="space-y-2 pt-2">
            {vehicles.map((v) => (
              <div key={v.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{v.code}</span>
                  <span className="text-xs text-muted-foreground flex-1 truncate">{v.label || ""}</span>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={v.out_of_service} onCheckedChange={(x) => updateVehicle(v.id, { out_of_service: !!x })} />
                    Fuori servizio
                  </label>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteVehicle(v.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {v.out_of_service && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input type="date" value={v.oos_from ? v.oos_from.slice(0, 10) : ""} onChange={(e) => updateVehicle(v.id, { oos_from: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                    <Input type="date" value={v.oos_to ? v.oos_to.slice(0, 10) : ""} onChange={(e) => updateVehicle(v.id, { oos_to: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                    <Input value={v.oos_reason ?? ""} onChange={(e) => updateVehicle(v.id, { oos_reason: e.target.value })} placeholder="Motivo" />
                  </div>
                )}
              </div>
            ))}
            {vehicles.length === 0 && <p className="text-sm text-muted-foreground">Nessun veicolo registrato.</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- IMPORT AI ---------- */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import intelligente</DialogTitle>
            <DialogDescription>Incolla una tabella/testo oppure carica un PDF, Excel o immagine con i servizi già registrati.</DialogDescription>
          </DialogHeader>
          <Textarea rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Incolla qui i servizi…" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importLoading}><FileUp className="h-4 w-4 mr-2" />Carica file</Button>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) runImport(f); }} />
            <Button onClick={() => runImport()} disabled={importLoading || !importText.trim()}>
              <Sparkles className="h-4 w-4 mr-2" />{importLoading ? "Analisi AI…" : "Analizza testo"}
            </Button>
          </div>
          {importRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm">{importRows.length} servizi riconosciuti:</p>
              <div className="max-h-60 overflow-y-auto space-y-1 text-xs">
                {importRows.map((r: any, i: number) => (
                  <div key={i} className="rounded border px-2 py-1">
                    {r.event_date} · {r.event_name} · {r.start_time || "?"}–{r.end_time || "?"} · {(r.assets ?? []).map((a: any) => a.vehicle_code).filter(Boolean).join(", ")}
                  </div>
                ))}
              </div>
              <Button onClick={confirmImport}>Importa {importRows.length} servizi</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
