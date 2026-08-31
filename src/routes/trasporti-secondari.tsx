import { PageHeader } from "@/components/PageHeader";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { isDemoActive } from "@/lib/demo-mode";
import {
  Ambulance, FileDown, FileUp, Trash2, Plus, Settings, Sparkles, Wand2,
  XCircle, Pencil, Copy, CornerDownLeft, Flag, CheckCircle2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { transportsInsight, suggestTransport, parseTransportsText } from "@/lib/api/transports.functions";
import { generateTransportsPDF } from "@/lib/pdf-transports-asufc";
import { parseAsufcPdf, extractPdfText } from "@/lib/parse-asufc-pdf";
import {
  Ctx, Field, FormState, Hospital, IntraTariff, AdiRoute, Kind, PlaceOption, Tariffs, Transport,
  buildPayload, emptyForm, eur, formFromTransport, monthNames, num, nrmRaw, patientLabel, placeLabel,
  stripRoundTrip, toLocalInput,
} from "@/components/transports/shared";
import { TransportForm, HistoryChips, QuickRouteChips } from "@/components/transports/TransportForm";
import { AiImportDialog, type ParsedRow } from "@/components/transports/AiImportDialog";

export const Route = createFileRoute("/trasporti-secondari")({
  head: () => ({
    meta: [
      { title: "Trasporti secondari · Gestione S.O.G.IT." },
      { name: "description", content: "Gestione dei trasporti ospedalieri, ADI e dei servizi con infermiere." },
      { property: "og:url", content: "https://your-domain.example/trasporti-secondari" },
      { property: "og:title", content: "Trasporti secondari · Gestione S.O.G.IT." },
      { property: "og:description", content: "Gestione dei trasporti ospedalieri, ADI e dei servizi con infermiere." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Trasporti secondari · Gestione S.O.G.IT." },
      { name: "twitter:description", content: "Gestione dei trasporti ospedalieri, ADI e dei servizi con infermiere." },
    ],
    links: [{ rel: "canonical", href: "https://your-domain.example/trasporti-secondari" }],
  }),
  component: Page,
});

const STICKY_DATE_KEY = "trasporti_sticky_date";

const parseDateAny = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0));
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, dd, mm, yy, hh, mi] = m;
    const y = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    return new Date(y, Number(mm) - 1, Number(dd), Number(hh || 0), Number(mi || 0));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

function Page() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [tab, setTab] = useState<Kind>("intra");

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [fatturaNumero, setFatturaNumero] = useState(() => (typeof window !== "undefined" && localStorage.getItem("trasp_fattura_n")) || "");
  const [fatturaData, setFatturaData] = useState(() => (typeof window !== "undefined" && localStorage.getItem("trasp_fattura_d")) || "");
  useEffect(() => { try { localStorage.setItem("trasp_fattura_n", fatturaNumero); } catch {} }, [fatturaNumero]);
  useEffect(() => { try { localStorage.setItem("trasp_fattura_d", fatturaData); } catch {} }, [fatturaData]);

  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [tariffs, setTariffs] = useState<Tariffs>({ id: "default", per_km: 1.46, sosta_hourly: 15, nurse_hourly: 35, detailed_time: false });
  const [intra, setIntra] = useState<IntraTariff[]>([]);
  const [adiRoutes, setAdiRoutes] = useState<AdiRoute[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiImportOpen, setAiImportOpen] = useState(false);

  const insightFn = useServerFn(transportsInsight);
  const suggestFn = useServerFn(suggestTransport);
  const parseTextFn = useServerFn(parseTransportsText);
  const [insight, setInsight] = useState<{ text: string; kpis: any } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const ctx: Ctx = useMemo(() => ({ hospitals, intra, adiRoutes, tariffs }), [hospitals, intra, adiRoutes, tariffs]);

  const load = async () => {
    const [{ data: hs }, { data: tf }, { data: intr }, { data: trs }, { data: adi }] = await Promise.all([
      supabase.from("transport_hospitals" as any).select("*").order("kind").order("sort_order").order("name"),
      supabase.from("transport_tariffs" as any).select("*").eq("id", "default").maybeSingle(),
      supabase.from("transport_intra_tariffs" as any).select("*"),
      supabase.from("secondary_transports" as any).select("*").order("transport_date", { ascending: false }),
      supabase.from("transport_adi_routes" as any).select("*").order("departure"),
    ]);
    setHospitals((hs as any) ?? []);
    if (tf) setTariffs({ ...(tf as any), detailed_time: !!(tf as any).detailed_time });
    setIntra((intr as any) ?? []);
    setTransports((trs as any) ?? []);
    setAdiRoutes((adi as any) ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const sUser = sess.session?.user;
      if (!sUser) { navigate({ to: "/auth", replace: true }); return; }
      const { data: hasAccess } = await supabase.rpc("has_transports_access" as any, { _uid: sUser.id });
      if (!hasAccess) { toast.error("Accesso non autorizzato"); navigate({ to: "/dashboard", replace: true }); return; }
      const { data: profile } = await supabase.from("profiles" as any).select("username").eq("id", sUser.id).maybeSingle();
      setUser(sUser);
      setUsername((profile as any)?.username ?? "");
      setReady(true);
      await load();
    })();
  }, []);

  const filtered = useMemo(() => transports.filter((t) => {
    const d = new Date(t.transport_date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  }), [transports, year, month]);

  const currentTabRows = useMemo(() => filtered.filter((t) => t.kind === tab), [filtered, tab]);

  const yearOptions = useMemo(() => {
    const yrs = new Set<number>([today.getFullYear()]);
    transports.forEach((t) => yrs.add(new Date(t.transport_date).getFullYear()));
    return Array.from(yrs).sort((a, b) => b - a);
  }, [transports]);

  const totals = (rows: Transport[]) => ({
    count: rows.length,
    cancelled: rows.filter((r) => r.annullato).length,
    km: rows.reduce((s, r) => s + Number(r.kilometers || 0), 0),
    kmCancelled: rows.filter((r) => r.annullato).reduce((s, r) => s + Number(r.kilometers || 0), 0),
    price: rows.reduce((s, r) => s + Number(r.price || 0) + Number(r.sosta_price || 0), 0),
    priceCancelled: rows.filter((r) => r.annullato).reduce((s, r) => s + Number(r.price || 0) + Number(r.sosta_price || 0), 0),
    sostaH: rows.reduce((s, r) => s + Number(r.sosta_hours || 0), 0),
    sostaEur: rows.reduce((s, r) => s + Number(r.sosta_price || 0), 0),
  });
  const tabTot = totals(currentTabRows);
  const monthTot = totals(filtered);

  // ============= Elenco luoghi proposti (registrati + già usati) =============
  const placesFor = (kind: Kind): PlaceOption[] => {
    const out: PlaceOption[] = [];
    if (kind === "intra") {
      hospitals.filter((h) => h.kind !== "reparto_latisana").forEach((h) => out.push({ id: h.id, name: h.name, group: "Ospedale" }));
      hospitals.filter((h) => h.kind === "reparto_latisana").forEach((h) => out.push({ id: h.id, name: h.name, group: "Latisana" }));
    }
    if (kind === "other") {
      adiRoutes.forEach((r) => { if (r.alias?.trim()) out.push({ id: `free:alias:${r.id}`, name: r.alias.trim(), group: "Alias" }); });
    }
    // Testi già usati in passato per lo stesso tipo di trasporto
    const seen = new Set(out.map((o) => nrmRaw(o.name)));
    transports.filter((t) => t.kind === kind).forEach((t) => {
      [t.departure_text, t.arrival_text].forEach((v) => {
        const s = (v || "").trim();
        if (!s || seen.has(nrmRaw(s))) return;
        seen.add(nrmRaw(s));
        out.push({ id: `free:${s}`, name: s, group: "Già usato" });
      });
    });
    return out;
  };
  const places = useMemo(() => placesFor(tab), [tab, hospitals, adiRoutes, transports]);

  // ============= MODULO DI INSERIMENTO =============
  const [form, setForm] = useState<FormState>(() => {
    const sticky = typeof window !== "undefined" ? localStorage.getItem(STICKY_DATE_KEY) : null;
    return emptyForm("intra", sticky || toLocalInput(new Date()));
  });
  useEffect(() => { try { localStorage.setItem(STICKY_DATE_KEY, form.date); } catch {} }, [form.date]);
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));
  const formRef = useRef<HTMLDivElement | null>(null);

  const switchTab = (k: Kind) => {
    setTab(k);
    setForm((f) => ({ ...emptyForm(k, f.date) }));
  };

  // Suggerimenti dallo storico paziente
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => { setHistory([]); }, [tab]);
  useEffect(() => {
    const last = form.last.trim();
    if (last.length < 2) { setHistory([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await suggestFn({ data: { lastName: last, kind: tab } });
        if (alive) setHistory(((res as any).suggestions || []).slice(0, 6));
      } catch { if (alive) setHistory([]); }
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [form.last, tab]);

  const applyHistory = (s: any) => {
    patch({
      first: s.first_name || form.first,
      fromId: s.departure_hospital_id || "",
      fromText: s.departure_text || placeLabel(ctx, s.departure_hospital_id, null).replace("—", ""),
      toId: s.arrival_hospital_id || "",
      toText: s.arrival_text || placeLabel(ctx, s.arrival_hospital_id, null).replace("—", ""),
      km: s.kilometers != null ? String(s.kilometers) : form.km,
      nurseH: s.nurse_hours != null ? String(s.nurse_hours) : form.nurseH,
      nurseRate: s.nurse_hourly != null ? String(s.nurse_hourly) : form.nurseRate,
      roundTrip: !!s.is_round_trip,
    });
    toast.success("Dati precedenti compilati: controlla e salva");
  };

  const applyQuickRoute = (r: AdiRoute) => {
    const rt = form.roundTrip;
    const km = rt ? (r.kilometers_rt ?? r.kilometers) : r.kilometers;
    const price = rt ? (r.price_rt ?? r.price) : r.price;
    patch({
      fromText: r.departure, fromId: "",
      toText: r.arrival, toId: "",
      adiRouteId: r.id,
      km: form.km === "" && km != null ? String(km) : form.km,
      price: form.price === "" ? (form.annullato ? "0" : (price != null ? String(price) : "")) : form.price,
    });
  };

  // Avviso duplicato in tempo reale
  const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
  const duplicateOf = (f: FormState) => {
    if (!f.last.trim() && !f.toText.trim()) return null;
    return transports.find((t) =>
      t.kind === f.kind &&
      sameDay(t.transport_date, f.date) &&
      nrmRaw(t.last_name) === nrmRaw(f.last) &&
      nrmRaw(t.first_name) === nrmRaw(f.first) &&
      nrmRaw(t.arrival_text || placeLabel(ctx, t.arrival_hospital_id, null)) === nrmRaw(f.toText)
    ) ?? null;
  };
  const formDuplicate = useMemo(() => !!duplicateOf(form), [form, transports]);

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const submit = async (keepRoute: boolean) => {
    if (savingRef.current) return;
    const built = buildPayload(ctx, form);
    if ("error" in built) return toast.error(built.error);
    savingRef.current = true;
    setSaving(true);
    try {
      const payload = { ...built.data, kind: form.kind, user_id: user.id, username };
      const { data, error } = await supabase.from("secondary_transports" as any).insert(payload).select("id").single();
      if (error) return void toast.error(error.message);
      const newId = (data as any)?.id as string | undefined;
      toast.success("Trasporto registrato", newId ? {
        action: {
          label: "Annulla",
          onClick: async () => {
            await supabase.from("secondary_transports" as any).delete().eq("id", newId);
            toast.info("Inserimento annullato");
            load();
          },
        },
      } : undefined);
      setForm((f) => keepRoute
        ? { ...f, first: "", last: "", twoPatients: false, first2: "", last2: "", notes: "", depTime: "", arrTime: "", annullato: false }
        : emptyForm(f.kind, f.date));
      await load();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const duplicateRow = (r: Transport) => {
    setTab(r.kind);
    setForm(formFromTransport(r));
    toast.info("Dati copiati nel modulo: modifica e registra");
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const del = async (id: string) => {
    if (!confirm("Eliminare questo trasporto?")) return;
    const { error } = await supabase.from("secondary_transports" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    setSelectedIds((s) => { const n = new Set(s); n.delete(id); return n; });
    load();
  };

  const toggleAnnullato = async (r: Transport) => {
    const { error } = await supabase.from("secondary_transports" as any).update({ annullato: !r.annullato }).eq("id", r.id);
    if (error) return toast.error(error.message);
    load();
  };

  const toggleReview = async (r: Transport) => {
    const needsReview = !r.needs_review;
    const { error } = await supabase.from("secondary_transports" as any).update({
      needs_review: needsReview,
      reviewed_at: needsReview ? null : new Date().toISOString(),
      reviewed_by: needsReview ? null : user.id,
    }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(needsReview ? "Aggiunto alle revisioni" : "Revisione completata");
    load();
  };

  const [reviewOnly, setReviewOnly] = useState(false);
  const visibleTabRows = useMemo(
    () => reviewOnly ? currentTabRows.filter((row) => row.needs_review) : currentTabRows,
    [currentTabRows, reviewOnly],
  );

  // ============= SELEZIONE MULTIPLA =============
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleOne = (id: string) => setSelectedIds((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectedInTab = useMemo(
    () => currentTabRows.filter((r) => selectedIds.has(r.id)).length,
    [currentTabRows, selectedIds],
  );
  const allSelectedInTab = currentTabRows.length > 0 && selectedInTab === currentTabRows.length;
  const toggleAllInTab = () => setSelectedIds((s) => {
    const n = new Set(s);
    if (allSelectedInTab) currentTabRows.forEach((r) => n.delete(r.id));
    else currentTabRows.forEach((r) => n.add(r.id));
    return n;
  });
  useEffect(() => { setSelectedIds(new Set()); }, [tab, year, month]);

  const bulkDelete = async () => {
    const ids = currentTabRows.filter((r) => selectedIds.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    if (!confirm(`Eliminare ${ids.length} trasporti selezionati? L'operazione è irreversibile.`)) return;
    const chunkSize = 25;
    let done = 0;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const { error } = await supabase.from("secondary_transports" as any).delete().in("id", slice);
      if (error) {
        await load();
        setSelectedIds(new Set());
        return toast.error(`Errore dopo ${done} eliminati: ${error.message}`);
      }
      done += slice.length;
    }
    toast.success(`${done} trasporti eliminati`);
    setSelectedIds(new Set());
    load();
  };

  // ============= MODIFICA =============
  const [editRow, setEditRow] = useState<Transport | null>(null);
  const [editForm, setEditForm] = useState<FormState | null>(null);
  const [eSaving, setESaving] = useState(false);

  const openEdit = (r: Transport) => { setEditRow(r); setEditForm(formFromTransport(r)); };

  const saveEdit = async () => {
    if (!editRow || !editForm) return;
    const built = buildPayload(ctx, editForm);
    if ("error" in built) return toast.error(built.error);
    setESaving(true);
    const { data, error } = await supabase
      .from("secondary_transports" as any)
      .update(built.data)
      .eq("id", editRow.id)
      .select("id");
    setESaving(false);
    if (error) return toast.error(error.message);
    if (!data || (data as any[]).length === 0) return toast.error("Modifica non salvata: permessi insufficienti");
    setTransports((prev) => prev.map((t) => (t.id === editRow.id ? { ...t, ...(built.data as any) } : t)));
    toast.success("Trasporto aggiornato");
    setEditRow(null); setEditForm(null);
    load();
  };

  // ============= IMPORT XLSX/CSV =============
  const importRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  const LATISANA_IMPORT = ["PS","PPI","MED","MED A","MED B","MED C","PED","ORT","ORL","CHI","GIN","DH","RSA","CARDIO","NEURO","ONCO","URO","OSTE","DIALISI"];
  const normStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, "");
  const findHospitalByText = (raw: string): { id: string | null } => {
    const t = raw.trim();
    if (!t) return { id: null };
    if (LATISANA_IMPORT.includes(t.toUpperCase())) {
      return { id: hospitals.find((h) => /latisana/i.test(h.name))?.id ?? null };
    }
    const n = normStr(t);
    let h = hospitals.find((x) => normStr(x.name) === n);
    if (h) return { id: h.id };
    h = hospitals.find((x) => normStr(x.name).includes(n) || n.includes(normStr(x.name)));
    return { id: h?.id ?? null };
  };

  /** Riga estratta (AI o PDF) → payload database, senza ricalcoli invasivi. */
  const payloadFromParsed = (r: ParsedRow) => {
    const d = parseDateAny(r.date) ?? new Date();
    const perKm = Number(tariffs.per_km) || 0;
    const base: any = {
      kind: r.kind,
      transport_date: d.toISOString(),
      first_name: (r.first_name || "").trim() || null,
      last_name: (r.last_name || "").trim() || null,
      first_name_2: (r.first_name_2 || "").trim() || null,
      last_name_2: (r.last_name_2 || "").trim() || null,
      notes: r.notes ? String(r.notes) : null,
      user_id: user.id,
      username,
      is_round_trip: !!r.is_round_trip,
      annullato: !!r.annullato,
      departure_time: r.departure_time || null,
      arrival_time: r.arrival_time || null,
      sosta_hours: r.sosta_hours ?? 0,
      sosta_price: r.sosta_price ?? Number(r.sosta_hours || 0) * (Number(tariffs.sosta_hourly) || 0),
    };
    if (r.kind === "nurse") {
      base.arrival_text = (r.arrival || "").trim() || null;
      base.nurse_hours = r.nurse_hours ?? null;
      base.nurse_hourly = r.nurse_hourly ?? Number(tariffs.nurse_hourly);
      base.price = r.price ?? Number(r.nurse_hours || 0) * Number(base.nurse_hourly || 0);
      return base;
    }
    const from = (r.departure || "").trim();
    const { text: toClean, rt } = stripRoundTrip((r.arrival || "").trim());
    if (rt) base.is_round_trip = true;
    base.departure_text = from || null;
    base.arrival_text = toClean || null;
    const fromId = findHospitalByText(from).id;
    const toId = findHospitalByText(toClean).id;
    if (fromId) base.departure_hospital_id = fromId;
    if (toId) base.arrival_hospital_id = toId;
    base.kilometers = r.kilometers ?? 0;
    base.price = r.price ?? (r.kilometers != null ? Number(r.kilometers) * perKm : 0);
    return base;
  };

  const buildImportPayloads = (rows: any[], forcedKind?: Kind) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const findKey = (row: any, ...names: string[]) => {
      const keys = Object.keys(row);
      for (const n of names) {
        const nn = norm(n);
        const hit = keys.find((k) => norm(k) === nn);
        if (hit) return row[hit];
      }
      return null;
    };
    const normTime = (v: any): string | null => {
      if (v == null || v === "") return null;
      const m = String(v).trim().match(/(\d{1,2})[:.](\d{2})/);
      return m ? `${String(Number(m[1])).padStart(2, "0")}:${m[2]}` : null;
    };
    const out: ParsedRow[] = [];
    for (const r of rows) {
      const rowKind: Kind = (forcedKind ?? (r.kind as Kind) ?? tab);
      const d = parseDateAny(findKey(r, "data", "date", "giorno")) ?? new Date();
      const paziente = String(findKey(r, "paziente", "nominativo") ?? "").trim();
      let first = String(findKey(r, "nome", "first_name") ?? "").trim();
      let last = String(findKey(r, "cognome", "last_name") ?? "").trim();
      if (!first && !last && paziente) {
        const parts = paziente.split(/\s+/);
        last = parts[0] || ""; first = parts.slice(1).join(" ");
      }
      const paziente2 = String(findKey(r, "paziente 2", "paziente2", "secondo paziente") ?? "").trim();
      let first2 = String(findKey(r, "nome 2", "first_name_2") ?? "").trim();
      let last2 = String(findKey(r, "cognome 2", "last_name_2") ?? "").trim();
      if (!first2 && !last2 && paziente2) {
        const parts2 = paziente2.split(/\s+/);
        last2 = parts2[0] || ""; first2 = parts2.slice(1).join(" ");
      }
      out.push({
        kind: rowKind,
        date: toLocalInput(d).slice(0, 10),
        first_name: first || null,
        last_name: last || null,
        first_name_2: first2 || null,
        last_name_2: last2 || null,
        departure: String(findKey(r, "partenza", "from", "departure", "reparto", "reparto origine") ?? "").trim() || null,
        arrival: String(findKey(r, "arrivo", "to", "arrival", "destinazione") ?? "").trim() || null,
        kilometers: num(findKey(r, "km", "chilometri", "kilometers")),
        price: num(findKey(r, "prezzo", "price", "importo", "totale", "tariffa")),
        sosta_hours: num(findKey(r, "ore sosta", "sosta", "sosta_h", "ore_sosta")) ?? 0,
        sosta_price: num(findKey(r, "prezzo sosta", "sosta_prezzo", "sosta_price", "€ sosta")),
        nurse_hours: num(findKey(r, "ore", "hours", "ore infermiere", "nurse_hours")),
        nurse_hourly: num(findKey(r, "tariffa oraria", "€/ora", "eur ora", "nurse_hourly")),
        departure_time: normTime(findKey(r, "ora partenza", "orapartenza", "departure_time", "ora_partenza")),
        arrival_time: normTime(findKey(r, "ora arrivo", "oraarrivo", "arrival_time", "ora_arrivo")),
        is_round_trip: false,
        annullato: r.annullato === true,
        notes: findKey(r, "note", "notes") ? String(findKey(r, "note", "notes")) : null,
      });
    }
    return out;
  };

  const [fileRows, setFileRows] = useState<ParsedRow[] | null>(null);
  const doImport = async (file: File) => {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
      if (rows.length === 0) { toast.error("Nessuna riga trovata"); return; }
      setFileRows(buildImportPayloads(rows, tab));
      setAiImportOpen(true);
    } catch (e: any) {
      toast.error(e.message || "Errore importazione");
    } finally { setImporting(false); if (importRef.current) importRef.current.value = ""; }
  };

  // ============= LETTURA ASSISTITA (PDF / testo) =============
  const parseForDialog = async (input: { text?: string; pdf?: { name: string; b64: string; mime: string } }): Promise<ParsedRow[]> => {
    if (fileRows) { const r = fileRows; setFileRows(null); return r; }
    let parsed: any[] = [];
    let localRows: any[] = [];
    let pdfText = "";
    if (input.pdf) {
      const bytes = Uint8Array.from(atob(input.pdf.b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], input.pdf.name, { type: input.pdf.mime });
      try {
        const local = await parseAsufcPdf(file);
        if (local) localRows = local;
      } catch { /* modello non riconosciuto: si prosegue con l'AI */ }
      try { pdfText = await extractPdfText(file); } catch { pdfText = ""; }
    }
    if (parsed.length === 0 && (input.text?.trim() || pdfText)) {
      const text = [input.text, pdfText].filter(Boolean).join("\n\n").trim();
      if (!text && !input.pdf) throw new Error("Nessun contenuto da leggere");
      try {
        const res: any = await parseTextFn({ data: { kind: tab, text } });
        parsed = (res.rows || []) as any[];
      } catch (error) {
        if (localRows.length === 0) throw error;
        parsed = localRows;
      }
    } else if (parsed.length === 0 && input.pdf) {
      const res: any = await parseTextFn({ data: {
        kind: tab, pdfBase64: input.pdf.b64, filename: input.pdf.name, mimeType: input.pdf.mime,
      } });
      parsed = (res.rows || []) as any[];
    }
    if (parsed.length === 0) parsed = localRows;
    if (parsed.length === 0) throw new Error("Nessuna riga riconosciuta: controlla il documento o incolla il testo.");

    const num = (value: any) => {
      if (value === null || value === undefined || value === "") return null;
      const raw = String(value).trim().replace(/\s/g, "");
      const comma = raw.lastIndexOf(",");
      const dot = raw.lastIndexOf(".");
      let normalized = raw;
      if (comma > dot) normalized = raw.replace(/\./g, "").replace(",", ".");
      else if (dot > comma && comma >= 0) normalized = raw.replace(/,/g, "");
      const parsedNumber = Number(normalized.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(parsedNumber) ? parsedNumber : null;
    };

    // Il parser locale riconosce barrature/annullamenti; l'AI legge meglio colonne,
    // km, orari e soste. Uniamo le due letture per non perdere nessuna informazione.
    if (localRows.length > 0 && parsed !== localRows) {
      const unused = new Set(localRows.map((_, index) => index));
      parsed = parsed.map((aiRow, aiIndex) => {
        const exactIndex = localRows.findIndex((local, index) => unused.has(index)
          && String(local.date || "").slice(0, 10) === String(aiRow.date || "").slice(0, 10)
          && nrmRaw(local.last_name) === nrmRaw(aiRow.last_name));
        const fallbackIndex = unused.has(aiIndex) ? aiIndex : -1;
        const index = exactIndex >= 0 ? exactIndex : fallbackIndex;
        if (index < 0) return aiRow;
        unused.delete(index);
        const local = localRows[index];
        const cancelled = !!aiRow.annullato || !!local.annullato;
        const preferPositive = (aiValue: any, localValue: any) => {
          const aiNumber = num(aiValue);
          const localNumber = num(localValue);
          if (aiNumber != null && aiNumber > 0) return aiNumber;
          if (localNumber != null && localNumber > 0) return localNumber;
          return aiNumber ?? localNumber;
        };
        return {
          ...local,
          ...aiRow,
          // Su una riga annullata uno zero esplicito del PDF è un dato finale,
          // non un valore mancante da sostituire con una stima dell'AI.
          kilometers: cancelled && num(local.kilometers) === 0 ? 0 : preferPositive(aiRow.kilometers, local.kilometers),
          price: cancelled && num(local.price) === 0 ? 0 : preferPositive(aiRow.price, local.price),
          sosta_hours: preferPositive(aiRow.sosta_hours, local.sosta_hours),
          sosta_price: preferPositive(aiRow.sosta_price, local.sosta_price),
          nurse_hours: preferPositive(aiRow.nurse_hours, local.nurse_hours),
          nurse_hourly: preferPositive(aiRow.nurse_hourly, local.nurse_hourly),
          is_round_trip: !!aiRow.is_round_trip || !!local.is_round_trip,
          annullato: cancelled,
        };
      });
    }

    // Normalizzazioni di sicurezza: km numerici, orari "HH:MM", X2 ovunque compaia.
    const time = (v: any) => {
      const t = String(v ?? "").trim();
      if (!t) return null;
      const m = t.match(/^(\d{1,2})\D?(\d{2})?/);
      if (!m) return null;
      const h = Number(m[1]); const mi = Number(m[2] ?? 0);
      if (!Number.isFinite(h) || h > 23 || mi > 59) return null;
      return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    };
    const rtRe = /\b(x\s*2|a\/?\s?r|andata\s*e?\/?\s*ritorno)\b/i;

    return parsed.map((r) => {
      const k: Kind = (r.kind === "intra" || r.kind === "other" || r.kind === "nurse") ? r.kind : tab;
      const { text: arrival, rt } = stripRoundTrip(String(r.arrival || ""));
      const dep = String(r.departure || "");
      const extraRt = rtRe.test(dep) || rtRe.test(String(r.notes || ""));
      return {
        kind: k,
        date: String(r.date || "").slice(0, 10) || toLocalInput(new Date()).slice(0, 10),
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
        first_name_2: r.first_name_2 ?? null,
        last_name_2: r.last_name_2 ?? null,
        departure: dep.replace(rtRe, "").replace(/\s{2,}/g, " ").trim() || null,
        arrival: arrival || null,
        kilometers: num(r.kilometers),
        price: num(r.price),
        sosta_hours: num(r.sosta_hours) ?? 0,
        sosta_price: num(r.sosta_price),
        nurse_hours: num(r.nurse_hours),
        nurse_hourly: num(r.nurse_hourly),
        departure_time: time(r.departure_time),
        arrival_time: time(r.arrival_time),
        is_round_trip: !!r.is_round_trip || rt || extraRt,
        annullato: !!r.annullato,
        notes: r.notes ?? null,
      } as ParsedRow;
    });
  };


  const isDuplicateParsed = (r: ParsedRow) => {
    const day = parseDateAny(r.date)?.toDateString();
    return transports.some((t) =>
      t.kind === r.kind &&
      new Date(t.transport_date).toDateString() === day &&
      nrmRaw(t.last_name) === nrmRaw(r.last_name) &&
      nrmRaw(t.first_name) === nrmRaw(r.first_name) &&
      nrmRaw(t.arrival_text) === nrmRaw(r.arrival),
    );
  };

  const confirmImport = async (rows: ParsedRow[]) => {
    if (rows.some((row) => !row.last_name?.trim())) {
      throw new Error("Inserisci il cognome in tutte le righe prima di importare");
    }
    if (rows.some((row) => row.kind !== "nurse" && !row.annullato && (row.kilometers == null || row.kilometers <= 0))) {
      throw new Error("Inserisci i km in tutti i viaggi non annullati prima di importare");
    }
    const payloads = rows.map(payloadFromParsed);
    const { error } = await supabase.from("secondary_transports" as any).insert(payloads);
    if (error) throw new Error(error.message);
    toast.success(`Importate ${payloads.length} righe`, isDemoActive()
      ? { description: "Modalità prova: le righe restano solo in locale e spariranno alla chiusura della prova." }
      : undefined);
    await load();
  };

  // ============= EXPORT (invariati) =============
  const exportPDF = async () => {
    if (filtered.length === 0) { toast.error("Nessun trasporto nel mese"); return; }
    const hospMap: Record<string, string> = {};
    hospitals.forEach((h) => { hospMap[h.id] = h.name; });
    try {
      const res = await generateTransportsPDF({ year, month, rows: filtered as any, hospitals: hospMap, fatturaNumero, fatturaData });
      if (res?.url) {
        toast.success("PDF ASUFC generato", {
          description: "Se il download non parte, apri il file qui.",
          action: { label: "Apri PDF", onClick: () => window.open(res.url, "_blank", "noopener") },
        });
      }
    } catch (e: any) {
      console.error("PDF ASUFC", e);
      toast.error("Impossibile generare il PDF", { description: e?.message ?? "Errore sconosciuto" });
    }
  };

  const hospitalName = (id: string | null) => hospitals.find((h) => h.id === id)?.name ?? "";

  const exportXLSX = () => {
    if (filtered.length === 0) { toast.error("Nessun trasporto"); return; }
    const wb = XLSX.utils.book_new();
    const build = (rows: Transport[], cols: Record<string, (r: Transport) => any>) => {
      const arr = rows.map((r) => Object.fromEntries(Object.entries(cols).map(([k, fn]) => [k, fn(r)])));
      return XLSX.utils.json_to_sheet(arr);
    };
    const intraRows = filtered.filter((r) => r.kind === "intra");
    const otherRows = filtered.filter((r) => r.kind === "other");
    const nurseRows = filtered.filter((r) => r.kind === "nurse");
    if (intraRows.length) XLSX.utils.book_append_sheet(wb, build(intraRows, {
      Data: (r) => new Date(r.transport_date).toLocaleDateString("it-IT"),
      Paziente: (r) => patientLabel(r),
      "Reparto origine": (r) => placeLabel(ctx, r.departure_hospital_id, r.departure_text),
      Destinazione: (r) => `${hospitalName(r.arrival_hospital_id) || r.arrival_text || ""}${r.is_round_trip ? " X2" : ""}`,
      Km: (r) => Number(r.kilometers || 0), "Tariffa €": (r) => Number(r.price || 0),
      "Ore sosta": (r) => Number(r.sosta_hours || 0), "€ sosta": (r) => Number(r.sosta_price || 0),
      Annullato: (r) => r.annullato ? "Sì" : "",
    }), "Ospedalieri");
    if (otherRows.length) XLSX.utils.book_append_sheet(wb, build(otherRows, {
      Data: (r) => new Date(r.transport_date).toLocaleDateString("it-IT"),
      Paziente: (r) => patientLabel(r),
      Partenza: (r) => placeLabel(ctx, null, r.departure_text),
      Destinazione: (r) => `${r.arrival_text || ""}${r.is_round_trip ? " X2" : ""}`,
      Km: (r) => Number(r.kilometers || 0), "Tariffa €": (r) => Number(r.price || 0),
      "Ore sosta": (r) => Number(r.sosta_hours || 0), "€ sosta": (r) => Number(r.sosta_price || 0),
      Annullato: (r) => r.annullato ? "Sì" : "",
    }), "ADI");
    if (nurseRows.length) XLSX.utils.book_append_sheet(wb, build(nurseRows, {
      Data: (r) => new Date(r.transport_date).toLocaleDateString("it-IT"),
      Paziente: (r) => patientLabel(r),
      Destinazione: (r) => r.arrival_text,
      "€/ora": (r) => Number(r.nurse_hourly || 0), Ore: (r) => Number(r.nurse_hours || 0),
      Totale: (r) => Number(r.price || 0),
    }), "Infermiere");
    XLSX.writeFile(wb, `SECONDARI_${monthNames[month - 1].toLowerCase()}_${year}.xlsx`);
  };

  const runAI = async () => {
    setAiLoading(true);
    try {
      const res = await insightFn({ data: { year, month } });
      setInsight(res as any);
    } catch (e: any) { toast.error(e.message); } finally { setAiLoading(false); }
  };

  if (!ready) return <div className="min-h-screen app-surface grid place-items-center"><div className="text-sm text-muted-foreground">Caricamento…</div></div>;

  const tabTitle = tab === "intra" ? "ospedaliero" : tab === "other" ? "ADI / altro" : "con infermiere";

  return (
    <div className="min-h-screen app-surface">
      <PageHeader
        icon={<Ambulance className="h-5 w-5" />}
        eyebrow="Riservato"
        title="Trasporti secondari"
        subtitle={username}
        actions={
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Ospedali & tariffe</span>
          </Button>
        }
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Periodo · AI · export */}
        <Card className="border-border/60">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Mese</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>{monthNames.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Anno</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="ml-auto flex flex-wrap gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Fattura n°</Label>
                  <Input className="w-28" value={fatturaNumero} onChange={(e) => setFatturaNumero(e.target.value)} placeholder="es. 123" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data fattura</Label>
                  <Input className="w-36" value={fatturaData} onChange={(e) => setFatturaData(e.target.value)} placeholder="gg/mm/aaaa" />
                </div>
                <Button variant="outline" onClick={runAI} disabled={aiLoading}>
                  <Sparkles className="h-4 w-4 mr-2" /> {aiLoading ? "Analisi AI…" : "Analisi AI mensile"}
                </Button>
                <Button variant="outline" onClick={exportXLSX}><FileDown className="h-4 w-4 mr-2" /> Excel</Button>
                <Button onClick={exportPDF}><FileDown className="h-4 w-4 mr-2" /> PDF ASUFC</Button>
              </div>
            </div>

            {insight && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4 text-primary" /> Insight AI</div>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{insight.text}</p>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
              <KPI label="Trasporti (mese)" value={String(monthTot.count)} />
              <KPI label="Di cui annullati" value={`${monthTot.cancelled}`} />
              <KPI label="Km totali" value={monthTot.km.toFixed(1)} />
              <KPI label="Ricavo totale" value={eur(monthTot.price)} />
              <KPI label="Ore sosta" value={monthTot.sostaH.toFixed(1)} />
              <KPI label="Ricavo sosta" value={eur(monthTot.sostaEur)} />
            </div>
            {monthTot.cancelled > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Annullati inclusi nei totali: {monthTot.kmCancelled.toFixed(1)} km · {eur(monthTot.priceCancelled)}
              </p>
            )}
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={(v) => switchTab(v as Kind)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="intra">Ospedalieri</TabsTrigger>
            <TabsTrigger value="other">ADI / Altri</TabsTrigger>
            <TabsTrigger value="nurse">Infermiere</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* MODULO */}
        <Card className="border-border/60" ref={formRef as any}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Nuovo trasporto {tabTitle}</CardTitle>
            <CardDescription>
              Ogni campo è facoltativo e nulla viene ricalcolato da solo: km e prezzi restano <b>esattamente</b> quelli che scrivi,
              lo <b>0</b> compreso. Le tariffe compaiono come suggerimento e si applicano solo se premi “Applica”.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TransportForm
              value={form}
              onChange={patch}
              ctx={ctx}
              places={places}
              duplicate={formDuplicate}
              historyChips={<HistoryChips items={history} onApply={applyHistory} />}
              quickChips={tab === "other" ? <QuickRouteChips routes={adiRoutes} selectedId={form.adiRouteId} onApply={applyQuickRoute} /> : null}
            />
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setForm(emptyForm(tab, form.date))}>Svuota</Button>
              <Button variant="secondary" onClick={() => submit(true)} disabled={saving}>
                <CornerDownLeft className="h-4 w-4 mr-1" /> Registra e mantieni tratta
              </Button>
              <Button onClick={() => submit(false)} disabled={saving}>
                <Plus className="h-4 w-4 mr-1" /> {saving ? "Salvataggio…" : "Registra"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ELENCO */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-lg">Elenco {tab === "intra" ? "ospedalieri" : tab === "other" ? "ADI / altri" : "ore infermiere"} · {monthNames[month - 1]} {year}</CardTitle>
              <CardDescription>
                {tabTot.count} trasporti
                {tabTot.cancelled > 0 && ` (di cui ${tabTot.cancelled} annullati)`}
                {tab !== "nurse" && ` · ${tabTot.km.toFixed(1)} km`}
                {" · "}{eur(tabTot.price)}
                {tab !== "nurse" && ` · sosta ${tabTot.sostaH.toFixed(1)}h`}
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              {selectedInTab > 0 && (
                <Button variant="destructive" size="sm" onClick={bulkDelete}>
                  <Trash2 className="h-4 w-4 mr-1" /> Elimina {selectedInTab} selezionati
                </Button>
              )}
              <Button variant={reviewOnly ? "default" : "outline"} size="sm" onClick={() => setReviewOnly((value) => !value)}>
                <Flag className="h-4 w-4 mr-1" /> Da revisionare
              </Button>
              <input ref={importRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); }} />
              <Button variant="outline" size="sm" onClick={() => { setFileRows(null); setAiImportOpen(true); }}>
                <Sparkles className="h-4 w-4 mr-1" /> Import assistito
              </Button>
              <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importing}>
                <FileUp className="h-4 w-4 mr-1" /> {importing ? "Lettura…" : "Excel / CSV"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelectedInTab} onCheckedChange={toggleAllInTab} aria-label="Seleziona tutti" />
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Paziente</TableHead>
                    {tab !== "nurse" && <><TableHead>Partenza</TableHead><TableHead>Destinazione</TableHead><TableHead>Km</TableHead></>}
                    {tab === "nurse" && <><TableHead>Destinazione</TableHead><TableHead>Ore</TableHead><TableHead>€/ora</TableHead></>}
                    <TableHead>Prezzo</TableHead>
                    {tab !== "nurse" && <TableHead>Sosta</TableHead>}
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTabRows.map((r) => (
                    <TableRow
                      key={r.id}
                      className={`${r.annullato ? "opacity-50" : ""} ${r.needs_review ? "bg-amber-100/70 hover:bg-amber-100 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 border-l-4 border-l-amber-500" : ""}`}
                      data-state={selectedIds.has(r.id) ? "selected" : undefined}
                    >
                      <TableCell>
                        <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label="Seleziona riga" />
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.needs_review && (
                          <span className="mb-1 flex w-fit items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            <Flag className="h-3 w-3" /> Da revisionare
                          </span>
                        )}
                        {new Date(r.transport_date).toLocaleDateString("it-IT")}
                      </TableCell>
                      <TableCell>{patientLabel(r) || "—"}</TableCell>

                      {tab !== "nurse" && <>
                        <TableCell>{placeLabel(ctx, r.departure_hospital_id, r.departure_text)}</TableCell>
                        <TableCell>
                          {placeLabel(ctx, r.arrival_hospital_id, r.arrival_text)}
                          {r.is_round_trip && <span className="ml-1 text-xs font-bold text-destructive">X2</span>}
                        </TableCell>
                        <TableCell>{Number(r.kilometers || 0).toFixed(1)}</TableCell>
                      </>}
                      {tab === "nurse" && <>
                        <TableCell>{r.arrival_text}</TableCell>
                        <TableCell>{Number(r.nurse_hours || 0).toFixed(1)}</TableCell>
                        <TableCell>{eur(Number(r.nurse_hourly || 0))}</TableCell>
                      </>}
                      <TableCell className="font-medium whitespace-nowrap">{eur(Number(r.price || 0))}</TableCell>
                      {tab !== "nurse" && <TableCell>{Number(r.sosta_hours || 0).toFixed(1)}h</TableCell>}
                      <TableCell className="text-right whitespace-nowrap">
                        {r.needs_review && <span className="mr-1 inline-flex align-middle" title="Da revisionare"><Flag className="h-4 w-4 text-amber-600" /></span>}
                        <Button variant="ghost" size="icon" title="Modifica" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Duplica nel modulo" onClick={() => duplicateRow(r)}>
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" title={r.annullato ? "Ripristina" : "Segna annullato"} onClick={() => toggleAnnullato(r)}>
                          <XCircle className={`h-4 w-4 ${r.annullato ? "text-primary" : "text-muted-foreground"}`} />
                        </Button>
                        <Button variant="ghost" size="icon" title={r.needs_review ? "Completa revisione" : "Rivedi più tardi"} onClick={() => toggleReview(r)}>
                          {r.needs_review ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Flag className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="icon" title="Elimina" onClick={() => del(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleTabRows.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">{reviewOnly ? "Nessun trasporto da revisionare" : "Nessun trasporto per il mese selezionato"}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {tab === "other" && <AdiRoutesCard routes={adiRoutes} perKm={Number(tariffs.per_km)} onChanged={load} />}
      </main>

      <SettingsDialog
        open={settingsOpen} onClose={() => { setSettingsOpen(false); load(); }}
        hospitals={hospitals} tariffs={tariffs} intra={intra} onChanged={load}
      />

      <AiImportDialog
        open={aiImportOpen}
        onOpenChange={(v) => { setAiImportOpen(v); if (!v) setFileRows(null); }}
        defaultKind={tab}
        parse={parseForDialog}
        isDuplicate={isDuplicateParsed}
        onConfirm={confirmImport}
      />

      <Dialog open={!!editRow} onOpenChange={(v) => { if (!v) { setEditRow(null); setEditForm(null); } }}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" /> Modifica trasporto</DialogTitle></DialogHeader>
          {editForm && (
            <TransportForm
              value={editForm}
              onChange={(p) => setEditForm((f) => (f ? { ...f, ...p } : f))}
              ctx={ctx}
              places={placesFor(editForm.kind)}
              compact
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditRow(null); setEditForm(null); }}>Annulla</Button>
            <Button onClick={saveEdit} disabled={eSaving}>{eSaving ? "Salvataggio…" : "Salva modifiche"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl">{value}</div>
    </div>
  );
}

function SettingsDialog({ open, onClose, hospitals, tariffs, intra, onChanged }: {
  open: boolean; onClose: () => void;
  hospitals: Hospital[]; tariffs: Tariffs; intra: IntraTariff[];
  onChanged: () => void | Promise<void>;
}) {
  const [perKm, setPerKm] = useState(String(tariffs.per_km));
  const [sostaHr, setSostaHr] = useState(String(tariffs.sosta_hourly));
  const [nurseHr, setNurseHr] = useState(String(tariffs.nurse_hourly ?? 35));
  const [detailedTime, setDetailedTime] = useState(!!tariffs.detailed_time);
  const [newHosp, setNewHosp] = useState("");
  const [newHospKind, setNewHospKind] = useState<"hospital" | "reparto_latisana">("hospital");
  const [pairFrom, setPairFrom] = useState("");
  const [pairTo, setPairTo] = useState("");
  const [pairPrice, setPairPrice] = useState("");
  const [pairKm, setPairKm] = useState("");

  useEffect(() => {
    setPerKm(String(tariffs.per_km));
    setSostaHr(String(tariffs.sosta_hourly));
    setNurseHr(String(tariffs.nurse_hourly ?? 35));
    setDetailedTime(!!tariffs.detailed_time);
  }, [tariffs]);

  const saveTariffs = async () => {
    const { error } = await supabase.from("transport_tariffs" as any).update({
      per_km: num(perKm) ?? 0, sosta_hourly: num(sostaHr) ?? 0, nurse_hourly: num(nurseHr) ?? 0,
      detailed_time: detailedTime,
    }).eq("id", "default");
    if (error) return toast.error(error.message);
    toast.success("Tariffe aggiornate");
    await onChanged();
  };
  const addHospital = async () => {
    if (!newHosp.trim()) return;
    const { error } = await supabase.from("transport_hospitals" as any).insert({
      name: newHosp.trim(), sort_order: hospitals.length, kind: newHospKind,
    });
    if (error) return toast.error(error.message);
    setNewHosp(""); toast.success(newHospKind === "reparto_latisana" ? "Reparto Latisana aggiunto" : "Ospedale aggiunto");
    await onChanged();
  };
  const delHospital = async (id: string) => {
    if (!confirm("Eliminare?")) return;
    const { error } = await supabase.from("transport_hospitals" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    await onChanged();
  };
  const addPair = async () => {
    if (!pairFrom || !pairTo) return toast.error("Seleziona partenza e arrivo");
    const p = num(pairPrice);
    if (p == null) return toast.error("Prezzo non valido");
    const km = num(pairKm);
    const { error } = await supabase.from("transport_intra_tariffs" as any).upsert({
      departure_id: pairFrom, arrival_id: pairTo, price: p, kilometers: km,
    }, { onConflict: "departure_id,arrival_id" });
    if (error) return toast.error(error.message);
    setPairPrice(""); setPairKm(""); toast.success("Tariffa aggiornata");
    await onChanged();
  };
  const delPair = async (id: string) => {
    const { error } = await supabase.from("transport_intra_tariffs" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    await onChanged();
  };
  const hospName = (id: string) => hospitals.find((h) => h.id === id)?.name ?? "—";
  const reparti = hospitals.filter((h) => h.kind === "reparto_latisana");
  const veri = hospitals.filter((h) => h.kind !== "reparto_latisana");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Ospedali & tariffe</DialogTitle></DialogHeader>
        <div className="space-y-6">
          <section>
            <h3 className="font-semibold mb-2">Tariffe standard</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="€ per km"><Input inputMode="decimal" value={perKm} onChange={(e) => setPerKm(e.target.value)} /></Field>
              <Field label="€ per ora di sosta"><Input inputMode="decimal" value={sostaHr} onChange={(e) => setSostaHr(e.target.value)} /></Field>
              <Field label="€ tariffa oraria infermiere"><Input inputMode="decimal" value={nurseHr} onChange={(e) => setNurseHr(e.target.value)} /></Field>
            </div>
            <label className="flex items-center gap-3 mt-3 cursor-pointer text-sm">
              <Switch checked={detailedTime} onCheckedChange={setDetailedTime} />
              Evidenzia gli orari nel riepilogo
            </label>
            <div className="mt-2 flex justify-end"><Button size="sm" onClick={saveTariffs}>Salva tariffe</Button></div>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Ospedali & Reparti Latisana</h3>
            <div className="flex gap-2 mb-3 flex-wrap">
              <Input placeholder="Nome" className="flex-1 min-w-[200px]" value={newHosp} onChange={(e) => setNewHosp(e.target.value)} />
              <Select value={newHospKind} onValueChange={(v) => setNewHospKind(v as any)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hospital">Ospedale</SelectItem>
                  <SelectItem value="reparto_latisana">Reparto Latisana</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={addHospital}>Aggiungi</Button>
            </div>
            {reparti.length > 0 && (
              <div className="mb-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Reparti Latisana</div>
                <div className="flex flex-wrap gap-2">
                  {reparti.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-sm">
                      {h.name}
                      <button type="button" onClick={() => delHospital(h.id)} className="text-destructive"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Ospedali</div>
            <div className="flex flex-wrap gap-2">
              {veri.map((h) => (
                <div key={h.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-card text-sm">
                  {h.name}
                  <button type="button" onClick={() => delHospital(h.id)} className="text-destructive"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
              {veri.length === 0 && <p className="text-sm text-muted-foreground">Nessun ospedale.</p>}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Tariffe fisse per tratta (opzionali)</h3>
            <p className="text-xs text-muted-foreground mb-2">Prezzo fisso + chilometraggio standard: nel modulo compaiono come suggerimento da applicare con un clic.</p>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
              <Select value={pairFrom} onValueChange={setPairFrom}>
                <SelectTrigger><SelectValue placeholder="Partenza" /></SelectTrigger>
                <SelectContent>{hospitals.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={pairTo} onValueChange={setPairTo}>
                <SelectTrigger><SelectValue placeholder="Arrivo" /></SelectTrigger>
                <SelectContent>{hospitals.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input inputMode="decimal" placeholder="Km standard" value={pairKm} onChange={(e) => setPairKm(e.target.value)} />
              <Input inputMode="decimal" placeholder="Prezzo €" value={pairPrice} onChange={(e) => setPairPrice(e.target.value)} />
              <Button size="sm" onClick={addPair}>Salva tariffa</Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Partenza</TableHead><TableHead>Arrivo</TableHead><TableHead>Km</TableHead><TableHead>Prezzo</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {intra.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{hospName(p.departure_id)}</TableCell>
                    <TableCell>{hospName(p.arrival_id)}</TableCell>
                    <TableCell>{p.kilometers != null ? Number(p.kilometers).toFixed(1) : "—"}</TableCell>
                    <TableCell>{eur(Number(p.price))}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => delPair(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
                {intra.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nessuna tariffa impostata</TableCell></TableRow>}
              </TableBody>
            </Table>
          </section>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Chiudi</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= TRATTE ADI RICORRENTI (con alias) =============
function AdiRoutesCard({ routes, perKm, onChanged }: { routes: AdiRoute[]; perKm: number; onChanged: () => void | Promise<void> }) {
  const [dep, setDep] = useState("");
  const [arr, setArr] = useState("");
  const [alias, setAlias] = useState("");
  const [km, setKm] = useState("");
  const [priceManual, setPriceManual] = useState("");
  const [hasRt, setHasRt] = useState(false);
  const [kmRt, setKmRt] = useState("");
  const [priceRt, setPriceRt] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const autoPrice = useMemo(() => {
    const k = num(km);
    return k == null ? null : k * (perKm || 0);
  }, [km, perKm]);
  const price = useMemo(() => num(priceManual) ?? autoPrice, [priceManual, autoPrice]);

  const reset = () => {
    setDep(""); setArr(""); setAlias(""); setKm(""); setPriceManual("");
    setHasRt(false); setKmRt(""); setPriceRt(""); setEditId(null);
  };

  const save = async () => {
    if (!dep.trim() || !arr.trim()) return toast.error("Inserisci partenza e arrivo");
    const k = num(km);
    if (price == null) return toast.error("Inserisci il prezzo della sola andata (o i chilometri)");
    if (hasRt && num(priceRt) == null) return toast.error("Inserisci il prezzo fisso per l'andata e ritorno (X2)");
    const payload = {
      departure: dep.trim(),
      arrival: arr.trim(),
      alias: alias.trim() || null,
      kilometers: k ?? 0,
      price,
      kilometers_rt: hasRt ? num(kmRt) : null,
      price_rt: hasRt ? num(priceRt) : null,
    };
    setSaving(true);
    const q = editId
      ? supabase.from("transport_adi_routes" as any).update(payload).eq("id", editId)
      : supabase.from("transport_adi_routes" as any).insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message.includes("alias") ? "Alias già usato da un'altra tratta" : error.message);
    toast.success(editId ? "Tratta aggiornata" : "Tratta salvata");
    reset();
    await onChanged();
  };

  const formRef = useRef<HTMLDivElement | null>(null);
  const edit = (r: AdiRoute) => {
    setEditId(r.id); setDep(r.departure); setArr(r.arrival);
    setAlias(r.alias || ""); setKm(String(r.kilometers ?? ""));
    setPriceManual(r.price != null ? String(r.price) : "");
    setHasRt(r.price_rt != null || r.kilometers_rt != null);
    setKmRt(r.kilometers_rt != null ? String(r.kilometers_rt) : "");
    setPriceRt(r.price_rt != null ? String(r.price_rt) : "");
    toast.info(`Modifica tratta: ${r.alias || `${r.departure} → ${r.arrival}`}`);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminare questa tratta?")) return;
    const { error } = await supabase.from("transport_adi_routes" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (editId === id) reset();
    await onChanged();
  };

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg">Tratte ADI ricorrenti</CardTitle>
        <CardDescription>
          Salva le tratte fisse con un <b>alias</b>: nel modulo bastano un clic sul pulsante rapido oppure l'alias esatto
          per compilare km e prezzo. Attivando <b>X2</b> puoi registrare un importo dedicato all'andata e ritorno.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div ref={formRef} className="grid gap-3 md:grid-cols-4">
          <Field label="Partenza"><Input value={dep} onChange={(e) => setDep(e.target.value)} /></Field>
          <Field label="Arrivo"><Input value={arr} onChange={(e) => setArr(e.target.value)} /></Field>
          <Field label="Alias"><Input placeholder="es. Casa Rossi" value={alias} onChange={(e) => setAlias(e.target.value)} /></Field>
          <Field label="Km (sola andata)"><Input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} /></Field>
          <Field label="Prezzo fisso sola andata (€)">
            <Input
              inputMode="decimal"
              placeholder={autoPrice == null ? "es. 35.04" : autoPrice.toFixed(3)}
              value={priceManual}
              onChange={(e) => setPriceManual(e.target.value)}
            />
          </Field>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Switch id="adi-rt" checked={hasRt} onCheckedChange={(v) => setHasRt(!!v)} />
            <Label htmlFor="adi-rt" className="cursor-pointer text-sm">
              Aggiungi un importo dedicato per l'andata e ritorno <span className="font-bold text-destructive">X2</span>
            </Label>
          </div>
          {hasRt && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Km A/R (opzionale)"><Input inputMode="decimal" placeholder="es. 48" value={kmRt} onChange={(e) => setKmRt(e.target.value)} /></Field>
              <Field label="Prezzo fisso A/R X2 (€)"><Input inputMode="decimal" placeholder="es. 70.08" value={priceRt} onChange={(e) => setPriceRt(e.target.value)} /></Field>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          {editId && <Button variant="outline" onClick={reset}>Annulla</Button>}
          <Button onClick={save} disabled={saving}>
            <Plus className="h-4 w-4 mr-1" /> {editId ? "Salva modifiche" : "Aggiungi tratta"}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partenza</TableHead>
                <TableHead>Arrivo</TableHead>
                <TableHead>Alias</TableHead>
                <TableHead>Km</TableHead>
                <TableHead>Prezzo</TableHead>
                <TableHead>Km A/R</TableHead>
                <TableHead>Prezzo A/R</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.map((r) => (
                <TableRow key={r.id} data-state={editId === r.id ? "selected" : undefined}>
                  <TableCell>{r.departure}</TableCell>
                  <TableCell>{r.arrival}</TableCell>
                  <TableCell>{r.alias || "—"}</TableCell>
                  <TableCell>{Number(r.kilometers || 0).toFixed(1)}</TableCell>
                  <TableCell className="font-medium">{eur(Number(r.price || 0))}</TableCell>
                  <TableCell>{r.kilometers_rt != null ? Number(r.kilometers_rt).toFixed(1) : "—"}</TableCell>
                  <TableCell className="font-medium">{r.price_rt != null ? eur(Number(r.price_rt)) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" title="Modifica" onClick={() => edit(r)}><Pencil className="h-4 w-4 text-muted-foreground" /></Button>
                    <Button variant="ghost" size="icon" title="Elimina" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {routes.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nessuna tratta salvata</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
