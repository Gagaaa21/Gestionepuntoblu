import { RouteVisibilityGate } from "@/components/RouteVisibilityGate";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackHome";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, ListChecks, Plus, Trash2, Pencil, Save, X, ChevronDown,
  CheckCircle2, Sparkles, CalendarDays, MapPin, Package, ChevronLeft, ChevronRight, AlertTriangle,
  CheckSquare, Target,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { enqueueInsert, isNetworkError } from "@/lib/offline-queue";

export const Route = createFileRoute("/checklist")({
  head: () => ({
    meta: [
      { title: "Check list · Archivio clinico Punto Blu" },
      { name: "description", content: "Checklist operative dei mezzi e delle dotazioni: controlli periodici e segnalazione anomalie." },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app/checklist" },
      { property: "og:title", content: "Check list · Archivio clinico Punto Blu" },
      { property: "og:description", content: "Checklist operative dei mezzi e delle dotazioni: controlli periodici e segnalazione anomalie." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Check list · Archivio clinico Punto Blu" },
      { name: "twitter:description", content: "Checklist operative dei mezzi e delle dotazioni: controlli periodici e segnalazione anomalie." },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app/checklist" }],
  }),
  component: ChecklistPage,
});

type Item = {
  id: string; content: string; pieces: number | null; location: string | null;
  sort_order: number; parent_id: string | null; created_at: string;
};
type Check = { id: string; item_id: string; user_id: string; checked_on: string };
type Completion = { id: string; user_id: string; username: string; completed_on: string };

const todayRome = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const prettyDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
};

function ProgressRing({ value, size = 56, stroke = 5 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-border)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="var(--color-primary)" strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums text-foreground">{Math.round(value)}%</span>
    </div>
  );
}

function ChecklistPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activePhase, setActivePhase] = useState(0);
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);
  const [guidedMode, setGuidedMode] = useState(false);

  const [parentSel, setParentSel] = useState("__root");
  const [content, setContent] = useState("");
  const [pieces, setPieces] = useState("");
  const [location, setLocation] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [eContent, setEContent] = useState(""); const [ePieces, setEPieces] = useState(""); const [eLocation, setELocation] = useState("");

  const [historyDate, setHistoryDate] = useState(todayRome());
  const today = todayRome();

  const load = async () => {
    const { data: its } = await supabase.from("checklist_items" as any).select("*").order("sort_order").order("created_at");
    const { data: chs } = await supabase.from("checklist_checks" as any).select("*").eq("checked_on", today);
    const { data: comp } = await supabase.from("checklist_completions" as any).select("*").order("completed_on", { ascending: false }).limit(200);
    setItems((its as any) ?? []);
    setChecks((chs as any) ?? []);
    setCompletions((comp as any) ?? []);
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
      .channel("checklist-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_items" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_checks" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_completions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Item[]>();
    for (const i of items) {
      const key = i.parent_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    }
    return map;
  }, [items]);

  const roots = childrenOf.get(null) ?? [];

  const allLeafIdsUnder = useMemo(() => {
    const fn = (id: string): string[] => {
      const kids = childrenOf.get(id) ?? [];
      if (kids.length === 0) return [id];
      return kids.flatMap((k) => fn(k.id));
    };
    return fn;
  }, [childrenOf]);

  const leafIds = useMemo(() => items.filter((i) => !childrenOf.get(i.id)?.length).map((i) => i.id), [items, childrenOf]);

  // Auto-complete the day's checklist when the user has checked every leaf
  const _globalAllDone = user
    ? (leafIds.length > 0 && leafIds.every((id) => checks.some((c) => c.item_id === id && c.user_id === user.id)))
    : false;
  const _myCompletedToday = user
    ? completions.some((c) => c.user_id === user.id && c.completed_on === today)
    : false;
  useEffect(() => {
    if (!user) return;
    if (_globalAllDone && !_myCompletedToday) {
      void markCompleted();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_globalAllDone, _myCompletedToday, user?.id]);

  if (!user) return null;

  const isChecked = (itemId: string) => checks.some((c) => c.item_id === itemId && c.user_id === user.id);
  const toggleExpand = (id: string) => {
    setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const toggleCheck = async (itemId: string, checked: boolean) => {
    if (checked) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueueInsert("checklist_checks", { item_id: itemId, user_id: user.id, checked_on: today });
        setChecks((prev) => [...prev, { id: `local-${itemId}`, item_id: itemId, user_id: user.id, checked_on: today }]);
        toast.success("Spunta salvata offline");
        return;
      }
      const { error } = await supabase.from("checklist_checks" as any).insert({ item_id: itemId, user_id: user.id, checked_on: today });
      if (error) {
        if (isNetworkError(error)) {
          enqueueInsert("checklist_checks", { item_id: itemId, user_id: user.id, checked_on: today });
          setChecks((prev) => [...prev, { id: `local-${itemId}`, item_id: itemId, user_id: user.id, checked_on: today }]);
          toast.success("Spunta salvata offline");
          return;
        }
        if (!error.message.includes("duplicate")) return toast.error(error.message);
      }
    } else {
      const { error } = await supabase.from("checklist_checks" as any).delete().eq("item_id", itemId).eq("user_id", user.id).eq("checked_on", today);
      if (error) return toast.error(error.message);
    }
    load();
  };

  /** Check every still-unchecked leaf inside the given set in one batch. */
  const checkAllLeaves = async (ids: string[]) => {
    const todo = ids.filter((id) => !isChecked(id));
    if (todo.length === 0) return toast.info("Tutte le voci di questa fase sono già spuntate");
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline) {
      todo.forEach((id) => enqueueInsert("checklist_checks", { item_id: id, user_id: user.id, checked_on: today }));
      setChecks((prev) => [...prev, ...todo.map((id) => ({ id: `local-${id}`, item_id: id, user_id: user.id, checked_on: today }))]);
      toast.success(`${todo.length} spunte salvate offline`);
      return;
    }
    const rows = todo.map((id) => ({ item_id: id, user_id: user.id, checked_on: today }));
    const { error } = await supabase.from("checklist_checks" as any).insert(rows);
    if (error && !error.message.includes("duplicate")) {
      if (isNetworkError(error)) {
        todo.forEach((id) => enqueueInsert("checklist_checks", { item_id: id, user_id: user.id, checked_on: today }));
        toast.success(`${todo.length} spunte salvate offline`);
        return;
      }
      return toast.error(error.message);
    }
    toast.success(`${todo.length} voci spuntate`);
    load();
  };

  const selectedRoot = selectedChecklistId ? roots.find((r) => r.id === selectedChecklistId) ?? null : null;
  const scopedLeafIds = selectedRoot ? allLeafIdsUnder(selectedRoot.id) : leafIds;
  const myCheckedLeafCount = scopedLeafIds.filter((id) => isChecked(id)).length;
  const overallProgress = scopedLeafIds.length === 0 ? 0 : (myCheckedLeafCount / scopedLeafIds.length) * 100;
  const allDone = scopedLeafIds.length > 0 && myCheckedLeafCount === scopedLeafIds.length;
  const globalCheckedCount = leafIds.filter((id) => isChecked(id)).length;
  const globalAllDone = leafIds.length > 0 && globalCheckedCount === leafIds.length;
  const myCompletedToday = completions.some((c) => c.user_id === user.id && c.completed_on === today);

  const markCompleted = async () => {
    const payload = { user_id: user.id, username, completed_on: today };
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueueInsert("checklist_completions", payload);
      toast.success("Check list segnata offline — verrà inviata appena torna la rete");
      return;
    }
    const { error } = await supabase.from("checklist_completions" as any).insert(payload);
    if (error) {
      if (isNetworkError(error)) {
        enqueueInsert("checklist_completions", payload);
        toast.success("Check list segnata offline — verrà inviata appena torna la rete");
        return;
      }
      if (!error.message.includes("duplicate")) return toast.error(error.message);
    }
    toast.success("Check list segnata come compilata 🎉");
    load();
  };



  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return toast.error("Inserisci un contenuto");
    const parent_id = parentSel === "__root" ? null : parentSel;
    const { error } = await supabase.from("checklist_items" as any).insert({
      content: content.trim(),
      pieces: pieces.trim() === "" ? null : Number(pieces),
      location: location.trim() || null,
      sort_order: items.filter((i) => i.parent_id === parent_id).length,
      parent_id,
    });
    if (error) return toast.error(error.message);
    setContent(""); setPieces(""); setLocation("");
    toast.success("Voce aggiunta");
    load();
  };

  const startEdit = (i: Item) => { setEditingId(i.id); setEContent(i.content); setEPieces(i.pieces == null ? "" : String(i.pieces)); setELocation(i.location ?? ""); };
  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("checklist_items" as any).update({
      content: eContent.trim(),
      pieces: ePieces.trim() === "" ? null : Number(ePieces),
      location: eLocation.trim() || null,
    }).eq("id", editingId);
    if (error) return toast.error(error.message);
    setEditingId(null); toast.success("Voce aggiornata"); load();
  };
  const removeItem = async (id: string) => {
    if (!confirm("Eliminare la voce e tutte le sotto-voci?")) return;
    const { error } = await supabase.from("checklist_items" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Voce eliminata"); load();
  };

  const renderItem = (item: Item, depth: number): React.ReactElement => {
    const kids = childrenOf.get(item.id) ?? [];
    const hasKids = kids.length > 0;
    const open = expanded.has(item.id);
    const checked = isChecked(item.id);
    return (
      <div key={item.id} className="group">
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
            hasKids ? "hover:bg-secondary/60" : "hover:bg-secondary/40",
            checked && !hasKids && "bg-primary/5"
          )}
          style={{ marginLeft: depth * 16 }}
        >
          {hasKids ? (
            <button
              onClick={() => toggleExpand(item.id)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border/60 bg-card text-muted-foreground transition-all hover:border-primary/40 hover:text-primary"
              aria-label={open ? "Comprimi" : "Espandi"}
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", open ? "rotate-0" : "-rotate-90")} />
            </button>
          ) : (
            <label className="relative grid h-6 w-6 shrink-0 cursor-pointer place-items-center">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => toggleCheck(item.id, !!v)}
                className="h-5 w-5 rounded-md border-2 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
            </label>
          )}

          {editingId === item.id ? (
            <div className="flex flex-1 items-center gap-2">
              <Input value={eContent} onChange={(e) => setEContent(e.target.value)} className="flex-1" />
              <Input value={ePieces} onChange={(e) => setEPieces(e.target.value)} placeholder="Pezzi" className="w-20" />
              <Input value={eLocation} onChange={(e) => setELocation(e.target.value)} placeholder="Posizione" className="w-40" />
              <Button variant="ghost" size="icon" onClick={saveEdit}><Save className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <div className={cn(
                  "truncate text-sm transition-all",
                  hasKids ? "font-semibold text-foreground" : checked ? "text-muted-foreground line-through decoration-primary/60" : "text-foreground"
                )}>
                  {item.content}
                </div>
                {!hasKids && (item.pieces != null || item.location) && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {item.pieces != null && (
                      <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" /> {item.pieces} pz</span>
                    )}
                    {item.location && (
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {item.location}</span>
                    )}
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(item.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              )}
            </>
          )}
        </div>

        {hasKids && (
          <div
            className={cn(
              "grid transition-all duration-300 ease-out",
              open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="overflow-hidden">
              <div className="mt-1 space-y-0.5 border-l border-dashed border-border/70 pl-2">
                {kids.map((c) => renderItem(c, depth + 1))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const phaseRoots = selectedRoot ? (childrenOf.get(selectedRoot.id) ?? []) : [];
  const phases = phaseRoots.map((root, idx) => {
    const leaves = allLeafIdsUnder(root.id);
    const done = leaves.filter((id) => isChecked(id)).length;
    const pct = leaves.length === 0 ? 0 : (done / leaves.length) * 100;
    return { root, idx, leaves, done, pct, completed: leaves.length > 0 && done === leaves.length };
  });

  const safePhase = Math.min(activePhase, Math.max(0, phases.length - 1));
  const current = phases[safePhase];

  const goNext = () => {
    if (safePhase < phases.length - 1) setActivePhase(safePhase + 1);
  };
  const goPrev = () => {
    if (safePhase > 0) setActivePhase(safePhase - 1);
  };

  return (
    <div className="min-h-screen app-surface"><RouteVisibilityGate path="/checklist" />
      <PageHeader
        icon={<ListChecks className="h-5 w-5" />}
        eyebrow="Operatività"
        title="Check list"
        subtitle={prettyDate(today)}
      />

      <main className="container mx-auto space-y-8 px-4 py-8">
        {/* Hero progress */}
        <section
          className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8"
          style={{ boxShadow: "var(--shadow-elegant)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, var(--primary-soft), transparent 70%)" }}
          />
          <div className="relative grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {selectedRoot ? `${selectedRoot.content} · ${phases.length} fas${phases.length === 1 ? "e" : "i"}` : `Procedura giornaliera · ${roots.length} check list`}
              </div>
              <h2 className="mt-3 font-display text-2xl sm:text-3xl">
                Ciao {username || "operatore"}, {selectedRoot ? (allDone ? "check list completata." : "iniziamo i controlli.") : "scegli da dove iniziare."}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedRoot
                  ? `${myCheckedLeafCount} di ${scopedLeafIds.length} voci spuntate in questa check list · le spunte si azzerano a fine giornata.`
                  : `${globalCheckedCount} di ${leafIds.length} voci spuntate complessivamente oggi.`}
              </p>

              <div className="mt-5 max-w-xl">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: `${selectedRoot ? overallProgress : (leafIds.length === 0 ? 0 : (globalCheckedCount / leafIds.length) * 100)}%`,
                      background: "var(--gradient-primary)",
                    }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {myCompletedToday ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Compilata oggi
                    </span>
                  ) : (
                    <Button size="sm" onClick={markCompleted} className="shadow-sm">
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> Segna come compilata
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {globalAllDone ? "Tutte le check list sono complete." : `${leafIds.length - globalCheckedCount} voci non ancora spuntate (puoi comunque procedere).`}
                  </span>
                </div>
              </div>
            </div>
            <div className="hidden sm:block">
              <ProgressRing value={selectedRoot ? overallProgress : (leafIds.length === 0 ? 0 : (globalCheckedCount / leafIds.length) * 100)} size={120} stroke={10} />
            </div>
            <div className="sm:hidden">
              <ProgressRing value={selectedRoot ? overallProgress : (leafIds.length === 0 ? 0 : (globalCheckedCount / leafIds.length) * 100)} size={88} stroke={8} />
            </div>
          </div>
        </section>

        {/* Step 1: choose a checklist */}
        {!selectedRoot ? (
          roots.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nessuna check list disponibile.
              </CardContent>
            </Card>
          ) : (
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl">Scegli la check list</h3>
                  <p className="text-sm text-muted-foreground">Seleziona quale check list compilare per iniziare le fasi.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {roots.map((root) => {
                  const leaves = allLeafIdsUnder(root.id);
                  const done = leaves.filter((id) => isChecked(id)).length;
                  const pct = leaves.length === 0 ? 0 : (done / leaves.length) * 100;
                  const phaseCount = (childrenOf.get(root.id) ?? []).length;
                  const isCompleted = leaves.length > 0 && done === leaves.length;
                  return (
                    <button
                      key={root.id}
                      onClick={() => { setSelectedChecklistId(root.id); setActivePhase(0); }}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl border bg-card p-5 text-left transition-all hover:-translate-y-0.5",
                        isCompleted ? "border-primary/40" : "border-border/60"
                      )}
                      style={{ boxShadow: "var(--shadow-card)" }}
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-50 blur-2xl transition-opacity group-hover:opacity-80"
                        style={{ background: "radial-gradient(circle, var(--primary-soft), transparent 70%)" }}
                      />
                      <div className="relative flex items-start gap-4">
                        <ProgressRing value={pct} size={56} stroke={5} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="truncate font-display text-lg">{root.content}</h4>
                            {isCompleted && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {phaseCount > 0 ? `${phaseCount} fas${phaseCount === 1 ? "e" : "i"} · ` : ""}
                            {done}/{leaves.length} voci
                          </p>
                          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                            Apri <ChevronRight className="h-3 w-3" />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )
        ) : phases.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              <div className="mb-3">Questa check list non ha ancora fasi configurate.</div>
              <Button variant="outline" size="sm" onClick={() => setSelectedChecklistId(null)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Torna alle check list
              </Button>
            </CardContent>
          </Card>
        ) : (
          <section className="space-y-5">
            {/* Breadcrumb */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedChecklistId(null)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Tutte le check list
              </Button>
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{selectedRoot.content}</span> · Fase {Math.min(activePhase, phases.length - 1) + 1} di {phases.length}
              </span>
            </div>

            {/* Stepper */}
            <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {phases.map((ph, i) => {
                  const isActive = i === safePhase;
                  const isDone = ph.completed;
                  return (
                    <React.Fragment key={ph.root.id}>
                      <button
                        onClick={() => setActivePhase(i)}
                        className={cn(
                          "group flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all",
                          isActive
                            ? "border-primary/60 bg-primary/5 shadow-sm"
                            : isDone
                              ? "border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50"
                              : "border-border/60 bg-secondary/30 hover:bg-secondary/60"
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular-nums transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : isDone
                                ? "bg-emerald-600 text-primary-foreground"
                                : "bg-card text-muted-foreground ring-1 ring-border/60"
                          )}
                        >
                          {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className={cn("block max-w-[160px] truncate text-sm font-medium", isActive ? "text-foreground" : "text-foreground/80")}>
                            {ph.root.content}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {ph.done}/{ph.leaves.length} voci
                          </span>
                        </span>
                      </button>
                      {i < phases.length - 1 && (
                        <div className="h-px w-6 shrink-0 bg-border/60" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Active phase card */}
            {current && (
              <article
                className={cn(
                  "relative overflow-hidden rounded-2xl border bg-card",
                  current.completed ? "border-primary/40" : "border-border/60",
                )}
                style={{ boxShadow: "var(--shadow-elegant)" }}
              >
                <header className="flex flex-wrap items-center gap-4 border-b border-border/60 p-5 sm:p-6">
                  <ProgressRing value={current.pct} size={64} stroke={6} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Fase {safePhase + 1} di {phases.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-display text-xl sm:text-2xl">{current.root.content}</h3>
                      {current.completed && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {current.done}/{current.leaves.length} voci completate
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant={guidedMode ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setGuidedMode((g) => !g)}
                      title="Mostra una voce alla volta"
                    >
                      <Target className="mr-1 h-3.5 w-3.5" /> {guidedMode ? "Esci da guidata" : "Modalità guidata"}
                    </Button>
                    {!current.completed && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => checkAllLeaves(current.leaves)}
                      >
                        <CheckSquare className="mr-1 h-3.5 w-3.5" /> Spunta tutta la fase
                      </Button>
                    )}
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => startEdit(current.root)}>
                          <Pencil className="mr-1 h-3 w-3" /> Modifica
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => removeItem(current.root.id)}>
                          <Trash2 className="mr-1 h-3 w-3" /> Elimina
                        </Button>
                      </>
                    )}
                  </div>
                </header>

                <div className="bg-secondary/20 p-3 sm:p-5">
                  {(childrenOf.get(current.root.id) ?? []).length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nessuna sotto-voce in questa fase</p>
                  ) : guidedMode ? (
                    (() => {
                      const nextLeafId = current.leaves.find((id) => !isChecked(id));
                      if (!nextLeafId) {
                        return (
                          <div className="rounded-2xl bg-card p-8 text-center">
                            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-primary" />
                            <div className="font-display text-lg">Fase completata 🎉</div>
                            <p className="mt-1 text-sm text-muted-foreground">Passa alla fase successiva o esci dalla modalità guidata.</p>
                          </div>
                        );
                      }
                      const leaf = items.find((x) => x.id === nextLeafId);
                      if (!leaf) return null;
                      return (
                        <div className="rounded-2xl bg-card p-6 sm:p-8 text-center space-y-4">
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            Voce {current.done + 1} di {current.leaves.length}
                          </div>
                          <h4 className="font-display text-2xl sm:text-3xl leading-tight">{leaf.content}</h4>
                          {(leaf.pieces != null || leaf.location) && (
                            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
                              {leaf.pieces != null && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1"><Package className="h-3.5 w-3.5" /> {leaf.pieces} pz</span>
                              )}
                              {leaf.location && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1"><MapPin className="h-3.5 w-3.5" /> {leaf.location}</span>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                            <Button size="lg" onClick={() => toggleCheck(leaf.id, true)} className="min-w-[200px]">
                              <CheckCircle2 className="mr-2 h-5 w-5" /> Spunta e avanti
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Suggerimento: usa "Spunta tutta la fase" per spuntarle tutte insieme.
                          </p>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="space-y-1">
                      {(childrenOf.get(current.root.id) ?? []).map((c) => renderItem(c, 0))}
                    </div>
                  )}
                  {isAdmin && editingId === current.root.id && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2">
                      <Input value={eContent} onChange={(e) => setEContent(e.target.value)} className="h-8 flex-1" />
                      <Button size="sm" className="h-8" onClick={saveEdit}><Save className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                    </div>
                  )}
                </div>

                <footer className="flex items-center justify-between gap-3 border-t border-border/60 bg-card/60 p-4">
                  <Button variant="outline" size="sm" disabled={safePhase === 0} onClick={goPrev}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> Fase precedente
                  </Button>
                  <div className="flex items-center gap-1.5">
                    {phases.map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          i === safePhase ? "w-6 bg-primary" : phases[i].completed ? "w-3 bg-emerald-400" : "w-3 bg-border"
                        )}
                      />
                    ))}
                  </div>
                  <Button size="sm" disabled={safePhase === phases.length - 1} onClick={goNext}>
                    Fase successiva <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </footer>
              </article>
            )}
          </section>
        )}

        {/* Admin: add voice */}
        {isAdmin && (
          <Card className="border-border/60" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display"><Plus className="h-5 w-5 text-primary" /> Aggiungi voce</CardTitle>
              <CardDescription>Crea fasi (macro-zone) e sotto-zone scegliendo la "voce padre". Lascia "Nessuna" per una nuova fase.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={addItem} className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Voce padre</Label>
                  <Select value={parentSel} onValueChange={setParentSel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__root">Nessuna (nuova fase)</SelectItem>
                      {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.content}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2"><Label>Contenuto / nome zona</Label><Input value={content} onChange={(e) => setContent(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Pezzi (opz.)</Label><Input type="number" min="0" value={pieces} onChange={(e) => setPieces(e.target.value)} /></div>
                <div className="space-y-2 sm:col-span-3"><Label>Posizione (opz.)</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
                <Button type="submit" className="sm:col-span-4">Aggiungi voce</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Segnalazioni CTA - in fondo alla check list */}
        <section
          className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 sm:p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(0 90% 70% / 0.35), transparent 70%)" }}
          />
          <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-200">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-lg leading-tight">Hai riscontrato un problema?</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Apri una segnalazione: indica data, problematica e urgenza. Sarà visibile a tutti gli operatori.
                </p>
              </div>
            </div>
            <Button asChild className="shrink-0">
              <Link to="/reports"><AlertTriangle className="mr-1.5 h-4 w-4" /> Vai alle segnalazioni</Link>
            </Button>
          </div>
        </section>

        {/* History */}
        <Card className="border-border/60" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display"><CalendarDays className="h-5 w-5 text-primary" /> Storico compilazioni</CardTitle>
            <CardDescription>Seleziona una data per vedere chi ha compilato la check list.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-end gap-3">
              <div className="space-y-1"><Label className="text-xs">Data</Label><Input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} /></div>
            </div>
            <div className="rounded-xl border border-border/60 bg-secondary/30 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {prettyDate(historyDate)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {completions.filter((c) => c.completed_on === historyDate).map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
                    <CheckCircle2 className="h-3 w-3" /> {c.username}
                  </span>
                ))}
                {completions.filter((c) => c.completed_on === historyDate).length === 0 && (
                  <span className="text-xs text-muted-foreground">Nessuna compilazione registrata</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
