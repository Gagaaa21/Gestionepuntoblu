import { RouteVisibilityGate } from "@/components/RouteVisibilityGate";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackHome";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft, Briefcase, Plus, ChevronsUpDown, Check, FileDown, Trash2, X, Pencil, CalendarClock,
} from "lucide-react";
import logoSogit from "@/assets/logo-sogit.jpg.asset.json";
import { cn } from "@/lib/utils";
import { generateMonthlyOfficeReport } from "@/lib/pdf-office-report";
import { useServerFn } from "@tanstack/react-start";
import { JobIcon } from "@/lib/job-titles";
import { listOfficeOperators } from "@/lib/api/admin.functions";
import { formatOperator } from "@/lib/format-operator";

export const Route = createFileRoute("/office")({
  head: () => ({
    meta: [
      { title: "Prestazioni ufficio · Punto Blu" },
      { name: "description", content: "Area ufficio di Gestione S.O.G.IT.: documenti, resoconti e strumenti amministrativi." },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app/office" },
      { property: "og:title", content: "Prestazioni ufficio · Punto Blu" },
      { property: "og:description", content: "Area ufficio di Gestione S.O.G.IT.: documenti, resoconti e strumenti amministrativi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Prestazioni ufficio · Punto Blu" },
      { name: "twitter:description", content: "Area ufficio di Gestione S.O.G.IT.: documenti, resoconti e strumenti amministrativi." },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app/office" }],
  }),
  component: OfficePage,
});

type OST = { id: string; name: string; sort_order: number; parent_id: string | null };
type OS = {
  id: string;
  patient_full_name: string | null;
  patient_initials: string | null;
  service_type_id: string | null;
  service_name: string;
  service_other: string | null;
  performed_at: string;
  notes: string | null;
  user_id: string;
  username: string | null;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const onlyLetter = (s: string) => (s.match(/\p{L}/u)?.[0] ?? "").toUpperCase();

// Build "YYYY-MM-DDTHH:mm" in local time for <input type="datetime-local">
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function OfficePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [types, setTypes] = useState<OST[]>([]);
  const [services, setServices] = useState<OS[]>([]);

  // form
  const [patientMode, setPatientMode] = useState<"initials" | "full">("initials");
  const [initFirst, setInitFirst] = useState("");
  const [initLast, setInitLast] = useState("");
  const [fullName, setFullName] = useState("");
  const [typeSel, setTypeSel] = useState("");
  const [typeOther, setTypeOther] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [extraServices, setExtraServices] = useState<{ sel: string; other: string }[]>([]);
  const [customDate, setCustomDate] = useState<string>("");
  const [operatorId, setOperatorId] = useState<string>("");
  const [operators, setOperators] = useState<{ id: string; username: string }[]>([]);
  const fetchOperators = useServerFn(listOfficeOperators);

  // edit dialog
  const [editing, setEditing] = useState<OS | null>(null);
  const [eMode, setEMode] = useState<"initials" | "full">("initials");
  const [eInitFirst, setEInitFirst] = useState("");
  const [eInitLast, setEInitLast] = useState("");
  const [eFullName, setEFullName] = useState("");
  const [eSel, setESel] = useState("");
  const [eOther, setEOther] = useState("");
  const [eNotes, setENotes] = useState("");
  const [eDate, setEDate] = useState("");
  const [eOperatorId, setEOperatorId] = useState("");

  // filter
  const today = new Date();
  const [filterYear, setFilterYear] = useState(today.getFullYear());
  const [filterMonth, setFilterMonth] = useState(today.getMonth() + 1);

  const load = async () => {
    const [{ data: tps }, { data: oss }] = await Promise.all([
      supabase.from("office_service_types" as any).select("*").order("name"),
      supabase.from("office_services" as any).select("*").order("performed_at", { ascending: false }),
    ]);
    setTypes((tps as any) ?? []);
    setServices((oss as any) ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const sUser = sess.session?.user;
      if (!sUser) { navigate({ to: "/auth", replace: true }); return; }
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles" as any).select("username").eq("id", sUser.id).maybeSingle(),
        supabase.from("user_roles" as any).select("role").eq("user_id", sUser.id),
      ]);
      const rs: string[] = ((roles as any) ?? []).map((r: any) => r.role);
      if (!(rs.includes("admin") && rs.includes("office"))) { navigate({ to: "/dashboard", replace: true }); return; }
      setUser(sUser);
      setUsername((profile as any)?.username ?? "");
      setOperatorId(sUser.id);
      setReady(true);
      load();
      try {
        const res = await fetchOperators();
        setOperators(res?.operators ?? []);
      } catch { /* ignore */ }
    })();
  }, []);

  const resolveTypeName = (raw: string) => {
    const n = norm(raw);
    const m = types.find((t) => norm(t.name) === n);
    return m ? { name: m.name, id: m.id } : { name: raw.trim(), id: null as string | null };
  };

  const buildPatient = (mode: "initials" | "full", a: string, b: string, full: string) => {
    if (mode === "initials") {
      const f = onlyLetter(a);
      const l = onlyLetter(b);
      if (!f || !l) return { error: "Inserisci entrambe le iniziali (Nome e Cognome)" };
      return { patient_full_name: null as string | null, patient_initials: `${f}.${l}.` };
    }
    const v = full.trim().replace(/\s+/g, " ");
    if (!v || !/\s/.test(v)) return { error: "Inserisci nome e cognome (separati da spazio)" };
    return { patient_full_name: v, patient_initials: null as string | null };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isAltro = typeSel === "__altro";
    const rawType = isAltro ? typeOther.trim() : typeSel.trim();
    if (!rawType) return toast.error("Seleziona o specifica la prestazione");

    const p = buildPatient(patientMode, initFirst, initLast, fullName);
    if ("error" in p) return toast.error(p.error);

    const rawList: { raw: string; isAltro: boolean }[] = [{ raw: rawType, isAltro }];
    for (const ex of extraServices) {
      const exIsAltro = ex.sel === "__altro";
      const r = exIsAltro ? ex.other.trim() : ex.sel.trim();
      if (r) rawList.push({ raw: r, isAltro: exIsAltro });
    }

    const performedAt = customDate ? new Date(customDate).toISOString() : new Date().toISOString();

    const selectedOp = operators.find((o) => o.id === operatorId);
    const opUserId = selectedOp?.id ?? user.id;
    const opUsername = selectedOp?.username ?? username;

    const payloads = rawList.map(({ raw, isAltro: ia }) => {
      const resolved = resolveTypeName(raw);
      const finalIsKnown = !!resolved.id;
      return {
        patient_full_name: p.patient_full_name,
        patient_initials: p.patient_initials,
        service_type_id: resolved.id,
        service_name: resolved.name,
        service_other: !finalIsKnown && ia ? raw : null,
        notes: notes.trim() || null,
        performed_at: performedAt,
        user_id: opUserId,
        username: opUsername,
      };
    });

    const { error } = await supabase.from("office_services" as any).insert(payloads);
    if (error) return toast.error(error.message);
    toast.success(payloads.length > 1 ? `${payloads.length} prestazioni registrate` : "Prestazione registrata");
    setInitFirst(""); setInitLast(""); setFullName("");
    setTypeSel(""); setTypeOther(""); setNotes(""); setExtraServices([]); setCustomDate("");
    setOperatorId(user.id);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questa prestazione?")) return;
    const { error } = await supabase.from("office_services" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Eliminata"); load();
  };

  const openEdit = (s: OS) => {
    setEditing(s);
    if (s.patient_full_name) {
      setEMode("full");
      setEFullName(s.patient_full_name);
      setEInitFirst(""); setEInitLast("");
    } else {
      setEMode("initials");
      const parts = (s.patient_initials ?? "").replace(/\./g, " ").trim().split(/\s+/);
      setEInitFirst(onlyLetter(parts[0] ?? ""));
      setEInitLast(onlyLetter(parts[1] ?? ""));
      setEFullName("");
    }
    // pre-select existing service (use "__altro" if it was a free-text)
    const known = types.find((t) => norm(t.name) === norm(s.service_name));
    if (s.service_other) {
      setESel("__altro");
      setEOther(s.service_other);
    } else if (known) {
      setESel(known.name);
      setEOther("");
    } else {
      setESel("__altro");
      setEOther(s.service_name);
    }
    setENotes(s.notes ?? "");
    setEDate(toLocalInput(new Date(s.performed_at)));
    setEOperatorId(s.user_id);
  };

  const handleEditSave = async () => {
    if (!editing) return;
    const isAltro = eSel === "__altro";
    const rawType = isAltro ? eOther.trim() : eSel.trim();
    if (!rawType) return toast.error("Seleziona o specifica la prestazione");

    const p = buildPatient(eMode, eInitFirst, eInitLast, eFullName);
    if ("error" in p) return toast.error(p.error);

    const resolved = resolveTypeName(rawType);
    const finalIsKnown = !!resolved.id;

    const performedAt = eDate ? new Date(eDate).toISOString() : editing.performed_at;

    const selectedOp = operators.find((o) => o.id === eOperatorId);
    const patch: any = {
      patient_full_name: p.patient_full_name,
      patient_initials: p.patient_initials,
      service_type_id: resolved.id,
      service_name: resolved.name,
      service_other: !finalIsKnown && isAltro ? rawType : null,
      notes: eNotes.trim() || null,
      performed_at: performedAt,
    };
    if (selectedOp) {
      patch.user_id = selectedOp.id;
      patch.username = selectedOp.username;
    }
    const { error } = await supabase.from("office_services" as any).update(patch).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Prestazione aggiornata");
    setEditing(null);
    load();
  };

  const filtered = useMemo(() => {
    return services.filter((s) => {
      const d = new Date(s.performed_at);
      return d.getFullYear() === filterYear && d.getMonth() + 1 === filterMonth;
    });
  }, [services, filterYear, filterMonth]);

  const yearOptions = useMemo(() => {
    const yrs = new Set<number>([today.getFullYear()]);
    services.forEach((s) => yrs.add(new Date(s.performed_at).getFullYear()));
    return Array.from(yrs).sort((a, b) => b - a);
  }, [services]);

  const monthNames = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

  const downloadPdf = async () => {
    if (filtered.length === 0) return toast.error("Nessuna prestazione per il mese selezionato");
    await generateMonthlyOfficeReport(filterYear, filterMonth, filtered as any);
  };

  if (!ready) {
    return (
      <div className="min-h-screen app-surface grid place-items-center">
        <div className="text-sm text-muted-foreground">Caricamento…</div>
      </div>
    );
  }

  const sortedTypes = [...types].sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));

  return (
    <div className="min-h-screen app-surface"><RouteVisibilityGate path="/office" />
      <PageHeader
        icon={<Briefcase className="h-5 w-5" />}
        eyebrow="Riservato"
        title="Prestazioni ufficio"
        subtitle={username}
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Card className="overflow-hidden border-border/60 shadow-[var(--shadow-card)] ring-1 ring-border/40">
          <div className="h-1.5 w-full" style={{ background: "var(--gradient-primary)" }} />
          <CardHeader className="bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_6%,transparent),transparent)] pb-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-primary)" }}>
                <Plus className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Nuova prestazione</CardTitle>
                <CardDescription className="leading-relaxed">Inserisci iniziali separate per nome e cognome, oppure il nome completo. Puoi anche scegliere una data diversa da oggi.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Patient block */}
              <div className="field-panel space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Label className="text-sm font-medium">Paziente</Label>
                  <RadioGroup
                    value={patientMode}
                    onValueChange={(v) => setPatientMode(v as any)}
                    className="flex gap-4"
                  >
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <RadioGroupItem value="initials" id="rm-i" /> Iniziali
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <RadioGroupItem value="full" id="rm-f" /> Nome e cognome
                    </label>
                  </RadioGroup>
                </div>

                {patientMode === "initials" ? (
                  <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Iniziale nome</Label>
                      <Input
                        value={initFirst}
                        onChange={(e) => setInitFirst(onlyLetter(e.target.value))}
                        maxLength={1}
                        placeholder="M"
                        className="text-center text-lg uppercase"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Iniziale cognome</Label>
                      <Input
                        value={initLast}
                        onChange={(e) => setInitLast(onlyLetter(e.target.value))}
                        maxLength={1}
                        placeholder="R"
                        className="text-center text-lg uppercase"
                      />
                    </div>
                    {(initFirst || initLast) && (
                      <div className="col-span-2 text-xs text-muted-foreground">
                        Risultato: <span className="font-medium text-foreground">{(initFirst || "_")}.{(initLast || "_")}.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Mario Rossi"
                    className="sm:max-w-sm"
                  />
                )}
              </div>

              {/* Service + date */}
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div className="space-y-2 min-w-0">
                  <Label>Prestazione eseguita</Label>
                  <Popover open={typeOpen} onOpenChange={setTypeOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox" className="w-full justify-between">
                        <span className="truncate">{typeSel === "__altro" ? "Altro…" : (typeSel || "Seleziona prestazione...")}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Cerca prestazione..." />
                        <CommandList onWheel={(e) => { e.currentTarget.scrollTop += e.deltaY; }}>
                          <CommandEmpty>Nessun risultato. Usa "Altro" per inserire una prestazione personalizzata.</CommandEmpty>
                          {(() => {
                            const sortIt = (a: OST, b: OST) => a.name.localeCompare(b.name, "it", { sensitivity: "base" });
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
                                    Altro…
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
                    <Input
                      placeholder="Specifica prestazione"
                      value={typeOther}
                      onChange={(e) => setTypeOther(e.target.value)}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><CalendarClock className="h-4 w-4" /> Data e ora</Label>
                  <Input
                    type="datetime-local"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="md:w-[230px]"
                  />
                  <p className="text-[11px] text-muted-foreground">Vuoto = adesso</p>
                </div>
              </div>

              {extraServices.map((ex, idx) => {
                const update = (patch: Partial<{ sel: string; other: string }>) =>
                  setExtraServices((arr) => arr.map((e, i) => i === idx ? { ...e, ...patch } : e));
                return (
                  <div key={idx} className="field-slot space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Prestazione aggiuntiva #{idx + 2}</Label>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setExtraServices((arr) => arr.filter((_, i) => i !== idx))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Select value={ex.sel} onValueChange={(v) => update({ sel: v })}>
                      <SelectTrigger><SelectValue placeholder="Seleziona prestazione..." /></SelectTrigger>
                      <SelectContent>
                        {sortedTypes.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                        <SelectItem value="__altro">Altro…</SelectItem>
                      </SelectContent>
                    </Select>
                    {ex.sel === "__altro" && (
                      <Input placeholder="Specifica prestazione" value={ex.other} onChange={(e) => update({ other: e.target.value })} />
                    )}
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm"
                onClick={() => setExtraServices((arr) => [...arr, { sel: "", other: "" }])}>
                <Plus className="h-4 w-4 mr-1" /> Aggiungi altra prestazione
              </Button>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Operatore</Label>
                  <Select value={operatorId} onValueChange={setOperatorId}>
                    <SelectTrigger><SelectValue placeholder="Seleziona operatore..." /></SelectTrigger>
                    <SelectContent>
                      {operators.length === 0 && user && (
                        <SelectItem value={user.id}>{formatOperator(username)}</SelectItem>
                      )}
                      {operators.map((op) => (
                        <SelectItem key={op.id} value={op.id}>{formatOperator(op.username)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Predefinito: te stesso. Puoi registrare a nome di un altro operatore abilitato.</p>
                </div>
                <div className="space-y-2">
                  <Label>Note (facoltative)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
              </div>

              <Button type="submit" className="w-full sm:w-auto">Registra prestazione</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/60 shadow-[var(--shadow-card)] ring-1 ring-border/40">
          <div className="h-1.5 w-full" style={{ background: "var(--gradient-primary)" }} />
          <CardHeader className="flex flex-col gap-3 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_6%,transparent),transparent)] sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-primary)" }}>
                <FileDown className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Prestazioni del mese</CardTitle>
                <CardDescription className="leading-relaxed">Filtra e scarica il resoconto mensile.</CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Mese</Label>
                <Select value={String(filterMonth)} onValueChange={(v) => setFilterMonth(Number(v))}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthNames.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Anno</Label>
                <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(Number(v))}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={downloadPdf} variant="default"><FileDown className="h-4 w-4 mr-1" /> Scarica PDF</Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data e ora</TableHead>
                <TableHead>Paziente</TableHead>
                <TableHead>Prestazione</TableHead>
                <TableHead>Operatore</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nessuna prestazione nel mese selezionato</TableCell></TableRow>
                ) : (
                  filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">{format(new Date(s.performed_at), "dd/MM/yyyy HH:mm", { locale: it })}</TableCell>
                      <TableCell className="text-sm">
                        {s.patient_full_name ? <span className="font-medium">{s.patient_full_name}</span> : <span className="text-muted-foreground">{s.patient_initials}</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.service_name}{s.service_other ? <span className="text-muted-foreground"> — {s.service_other}</span> : null}
                        {s.notes && <div className="text-xs text-muted-foreground mt-0.5">{s.notes}</div>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5">{formatOperator(s.username)}<JobIcon username={s.username} /></span></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)} title="Modifica"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} title="Elimina"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifica prestazione</DialogTitle>
            <DialogDescription>Aggiorna paziente, prestazione, data o note.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="field-panel space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label className="text-sm font-medium">Paziente</Label>
                <RadioGroup value={eMode} onValueChange={(v) => setEMode(v as any)} className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <RadioGroupItem value="initials" id="erm-i" /> Iniziali
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <RadioGroupItem value="full" id="erm-f" /> Nome e cognome
                  </label>
                </RadioGroup>
              </div>
              {eMode === "initials" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Iniziale nome</Label>
                    <Input value={eInitFirst} maxLength={1} onChange={(e) => setEInitFirst(onlyLetter(e.target.value))} className="text-center text-lg uppercase" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Iniziale cognome</Label>
                    <Input value={eInitLast} maxLength={1} onChange={(e) => setEInitLast(onlyLetter(e.target.value))} className="text-center text-lg uppercase" />
                  </div>
                </div>
              ) : (
                <Input value={eFullName} onChange={(e) => setEFullName(e.target.value)} placeholder="Mario Rossi" />
              )}
            </div>

            <div className="space-y-2">
              <Label>Prestazione</Label>
              <Select value={eSel} onValueChange={(v) => setESel(v)}>
                <SelectTrigger><SelectValue placeholder="Seleziona prestazione..." /></SelectTrigger>
                <SelectContent>
                  {sortedTypes.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                  <SelectItem value="__altro">Altro…</SelectItem>
                </SelectContent>
              </Select>
              {eSel === "__altro" && (
                <Input value={eOther} onChange={(e) => setEOther(e.target.value)} placeholder="Specifica prestazione" />
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1"><CalendarClock className="h-4 w-4" /> Data e ora</Label>
              <Input type="datetime-local" value={eDate} onChange={(e) => setEDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Operatore</Label>
              <Select value={eOperatorId} onValueChange={setEOperatorId}>
                <SelectTrigger><SelectValue placeholder="Seleziona operatore..." /></SelectTrigger>
                <SelectContent>
                  {operators.length === 0 && editing && (
                    <SelectItem value={editing.user_id}>{formatOperator(editing.username ?? "")}</SelectItem>
                  )}
                  {operators.map((op) => (
                    <SelectItem key={op.id} value={op.id}>{formatOperator(op.username)}</SelectItem>
                  ))}
                  {editing && !operators.some((o) => o.id === editing.user_id) && (
                    <SelectItem value={editing.user_id}>{formatOperator(editing.username ?? "operatore precedente")}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea value={eNotes} onChange={(e) => setENotes(e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annulla</Button>
            <Button onClick={handleEditSave}>Salva modifiche</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
