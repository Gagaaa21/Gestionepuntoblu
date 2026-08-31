import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { semanticQuery, type SemanticSearchResult } from "@/lib/api/intelligence.functions";
import {
  Users, BarChart3, FileDown, ListChecks, AlertTriangle, BookOpen,
  BookMarked, Shield, Briefcase, LayoutDashboard, FolderOpen, UserCircle,
  Search as SearchIcon, Sparkles, Loader2, FileText,
} from "lucide-react";

type Patient = { id: string; first_name: string; last_name: string };

type RouteEntry = {
  label: string;
  to: string;
  keywords?: string;
  icon: React.ComponentType<{ className?: string }>;
  requires?: "admin" | "office" | "developer";
};

const ROUTES: RouteEntry[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, keywords: "home principale" },
  { label: "Cerca pazienti e interventi", to: "/search", icon: FolderOpen, keywords: "ricerca cartelle" },
  { label: "Resoconto", to: "/report", icon: FileDown, keywords: "pdf report giornaliero" },
  { label: "Statistiche", to: "/stats", icon: BarChart3, keywords: "grafici dati numeri" },
  { label: "Check list", to: "/checklist", icon: ListChecks, keywords: "controlli routine" },
  { label: "Segnalazioni", to: "/reports", icon: AlertTriangle, keywords: "issue problemi" },
  { label: "Guida", to: "/guide", icon: BookOpen, keywords: "help aiuto documentazione" },
  { label: "Procedure", to: "/procedures", icon: BookMarked, keywords: "protocolli manuali" },
  { label: "Prestazioni ufficio", to: "/office", icon: Briefcase, keywords: "servizi office", requires: "office" },
  { label: "Admin", to: "/admin", icon: Shield, keywords: "gestione utenti configurazione", requires: "admin" },
  { label: "Sicurezza", to: "/security", icon: Shield, keywords: "audit log accessi", requires: "developer" },
];

type CommandPaletteProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CommandPalette({ open: openProp, onOpenChange }: CommandPaletteProps = {}) {
  const navigate = useNavigate();
  const controlled = typeof openProp === "boolean";
  const [openUncontrolled, setOpenUncontrolled] = useState(false);
  const open = controlled ? (openProp as boolean) : openUncontrolled;
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    if (controlled) {
      const next = typeof v === "function" ? (v as (p: boolean) => boolean)(open) : v;
      onOpenChange?.(next);
    } else {
      setOpenUncontrolled(v);
    }
  };
  const [query, setQuery] = useState("");
  const [authed, setAuthed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOffice, setIsOffice] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<SemanticSearchResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const runSemantic = useServerFn(semanticQuery);

  const askAi = async () => {
    const q = query.trim();
    if (q.length < 3 || aiLoading) return;
    setAiLoading(true); setAiError(null); setAiResult(null);
    try {
      const res = await runSemantic({ data: { query: q } });
      setAiResult(res);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Errore AI");
    } finally {
      setAiLoading(false);
    }
  };

  // auth + roles
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: sess } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = sess.user?.id;
      if (!uid) {
        setAuthed(false); setIsAdmin(false); setIsOffice(false); setIsDeveloper(false);
        return;
      }
      setAuthed(true);
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (cancelled) return;
      const rs = new Set((roles ?? []).map((r: { role: string }) => r.role));
      setIsAdmin(rs.has("admin"));
      setIsOffice(rs.has("office"));
      setIsDeveloper(rs.has("developer"));
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  // ⌘K / Ctrl+K (only when uncontrolled — the loader handles it otherwise)
  useEffect(() => {
    if (controlled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpenUncontrolled((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controlled]);

  // Lazy-load patients when opened
  useEffect(() => {
    if (!open || !authed || patients.length > 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name")
        .order("last_name", { ascending: true })
        .limit(500);
      if (!cancelled && data) setPatients(data as Patient[]);
    })();
    return () => { cancelled = true; };
  }, [open, authed, patients.length]);

  const visibleRoutes = useMemo(() => {
    return ROUTES.filter((r) => {
      if (!r.requires) return true;
      if (r.requires === "admin") return isAdmin;
      if (r.requires === "office") return isOffice;
      if (r.requires === "developer") return isDeveloper;
      return true;
    });
  }, [isAdmin, isOffice, isDeveloper]);

  const go = (to: string) => {
    setOpen(false);
    setQuery("");
    setAiResult(null);
    setAiError(null);
    // small delay so dialog animation doesn't fight route change
    requestAnimationFrame(() => navigate({ to }));
  };

  // Enter key → esegui ricerca AI se query >= 3 char e nessun match
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && query.trim().length >= 3) {
        e.preventDefault();
        askAi();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);


  if (!authed) return null;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Cerca paziente, sezione o chiedi con AI…"
        value={query}
        onValueChange={(v) => { setQuery(v); if (aiResult || aiError) { setAiResult(null); setAiError(null); } }}
      />
      <CommandList>
        <CommandEmpty>
          <div className="py-3 text-sm">
            <p className="text-muted-foreground mb-2">Nessun risultato diretto.</p>
            {query.trim().length >= 3 && (
              <button
                type="button"
                onClick={askAi}
                disabled={aiLoading}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Chiedi con AI: "{query.trim()}"
              </button>
            )}
          </div>
        </CommandEmpty>

        {query.trim().length >= 3 && !aiResult && !aiLoading && (
          <CommandGroup heading="AI">
            <CommandItem value={`__ai__ ${query}`} onSelect={askAi}>
              <Sparkles className="mr-2 h-4 w-4 text-primary" />
              <span>Chiedi con AI: <span className="font-medium">"{query.trim()}"</span></span>
              <span className="ml-auto text-[10px] text-muted-foreground">⌘⏎</span>
            </CommandItem>
          </CommandGroup>
        )}

        {aiLoading && (
          <CommandGroup heading="AI">
            <CommandItem value="__ai_loading__" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
              <span>Sto interpretando la richiesta…</span>
            </CommandItem>
          </CommandGroup>
        )}

        {aiError && (
          <CommandGroup heading="AI">
            <CommandItem value="__ai_error__" disabled>
              <AlertTriangle className="mr-2 h-4 w-4 text-rose-600" />
              <span className="text-rose-700">{aiError}</span>
            </CommandItem>
          </CommandGroup>
        )}

        {aiResult && (
          <>
            <CommandGroup heading="Interpretazione AI">
              <CommandItem value="__ai_understood__" disabled>
                <Sparkles className="mr-2 h-4 w-4 text-primary" />
                <span className="italic text-muted-foreground">{aiResult.understood}</span>
              </CommandItem>
            </CommandGroup>
            {aiResult.patients.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Pazienti trovati (${aiResult.patients.length})`}>
                  {aiResult.patients.slice(0, 10).map((p) => (
                    <CommandItem
                      key={`aip-${p.id}`}
                      value={`aip ${p.name}`}
                      onSelect={() => go(`/search?patient=${encodeURIComponent(p.id)}` as unknown as string)}
                    >
                      <UserCircle className="mr-2 h-4 w-4 opacity-70" />
                      <span>{p.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {aiResult.interventions.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Interventi trovati (${aiResult.interventions.length})`}>
                  {aiResult.interventions.slice(0, 12).map((i) => (
                    <CommandItem
                      key={`aii-${i.id}`}
                      value={`aii ${i.type} ${i.patient ?? ""} ${i.date}`}
                      onSelect={() => go("/search")}
                    >
                      <FileText className="mr-2 h-4 w-4 opacity-70" />
                      <span className="font-medium">{i.type}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{i.date}</span>
                      {i.patient && <span className="ml-2 text-xs">· {i.patient}</span>}
                      {i.ppi && <span className="ml-2 rounded bg-rose-100 px-1 py-0.5 text-[10px] text-rose-700">PPI</span>}
                      {i.fuori && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">fuori sede</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {aiResult.patients.length === 0 && aiResult.interventions.length === 0 && (
              <CommandGroup heading="AI">
                <CommandItem value="__ai_empty__" disabled>
                  <span className="text-muted-foreground">Nessun risultato per i filtri interpretati.</span>
                </CommandItem>
              </CommandGroup>
            )}
          </>
        )}

        <CommandGroup heading="Navigazione">
          {visibleRoutes.map((r) => {
            const Icon = r.icon;
            return (
              <CommandItem
                key={r.to}
                value={`${r.label} ${r.keywords ?? ""}`}
                onSelect={() => go(r.to)}
              >
                <Icon className="mr-2 h-4 w-4 opacity-70" />
                <span>{r.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        {patients.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Pazienti (${patients.length})`}>
              {patients.slice(0, 60).map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.last_name} ${p.first_name} ${p.first_name} ${p.last_name}`}
                  onSelect={() =>
                    go(`/search?patient=${encodeURIComponent(p.id)}` as unknown as string)
                  }
                >
                  <UserCircle className="mr-2 h-4 w-4 opacity-70" />
                  <span className="font-medium">{p.last_name}</span>
                  <span className="ml-1 text-muted-foreground">{p.first_name}</span>
                </CommandItem>
              ))}
              {patients.length > 60 && (
                <CommandItem value="__all_patients__" onSelect={() => go("/search")}>
                  <SearchIcon className="mr-2 h-4 w-4 opacity-70" />
                  <span>Vedi tutti in Cerca…</span>
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Azioni">
          <CommandItem value="nuovo intervento aggiungi" onSelect={() => go("/dashboard")}>
            <Users className="mr-2 h-4 w-4 opacity-70" />
            <span>Nuovo intervento</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
