import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  devSetRouteHidden, devListAuditLog,
  adminListLockouts, adminResetLockout,
  devListActiveSessions, devRevokeSession, devRevokeAllUserSessions,
} from "@/lib/api/admin.functions";

import { HIDEABLE_ROUTES, useHiddenRoutes } from "@/lib/hidden-routes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { Activity, Eye, EyeOff, KeyRound, ScrollText, Lock, RefreshCw, Code2, ShieldCheck, Monitor, LogOut, Search } from "lucide-react";
import { formatOperator } from "@/lib/format-operator";
import { format } from "date-fns";

/**
 * Pannello sicurezza visibile solo all'admin programmatore (ruolo 'developer').
 * Sezioni espandibili: visibilità schede, blocchi accessi, registro attività.
 */
export function DeveloperPanel({ username }: { username: string }) {
  const [isDev, setIsDev] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setIsDev(false); return; }
      const { data: roles } = await supabase
        .from("user_roles" as any).select("role").eq("user_id", data.user.id);
      setIsDev(((roles as any) ?? []).some((r: any) => r.role === "developer"));
    })();
  }, []);

  if (isDev === null) return null;
  if (!isDev || username !== "Gabriele.Simonovich") return null;

  return (
    <Card className="section-card" data-tone="admin">
      <CardHeader className="section-header">
        <div className="flex items-start gap-3">
          <div className="icon-chip"><ShieldCheck className="h-5 w-5" /></div>
          <div className="min-w-0 space-y-1">
            <CardTitle className="font-display text-xl tracking-tight">Centro sicurezza</CardTitle>
            <CardDescription className="leading-relaxed">
              Strumenti riservati all'admin programmatore. Espandi una sezione per accedere.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <AuditLogSection />
        <Accordion type="multiple" className="mt-4 space-y-3">
          <AccordionItem value="visibility" className="rounded-xl border bg-card/50 px-3">
            <AccordionTrigger className="hover:no-underline">
              <span className="inline-flex items-center gap-2 font-medium">
                <Code2 className="h-4 w-4" /> Visibilità delle schede
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <HiddenRoutesSection />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="lockouts" className="rounded-xl border bg-card/50 px-3">
            <AccordionTrigger className="hover:no-underline">
              <span className="inline-flex items-center gap-2 font-medium">
                <Lock className="h-4 w-4" /> Tentativi di accesso & blocchi
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <LockoutsSection />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sessions" className="rounded-xl border bg-card/50 px-3">
            <AccordionTrigger className="hover:no-underline">
              <span className="inline-flex items-center gap-2 font-medium">
                <Monitor className="h-4 w-4" /> Sessioni attive
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ActiveSessionsSection />
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </CardContent>
    </Card>
  );
}

function HiddenRoutesSection() {
  const { hidden, refetch } = useHiddenRoutes();
  const setHidden = useServerFn(devSetRouteHidden);
  const [busy, setBusy] = useState<string | null>(null);
  // Stato ottimistico locale per riflettere immediatamente lo switch.
  const [optimistic, setOptimistic] = useState<Map<string, boolean>>(new Map());

  const isHidden = (path: string) =>
    optimistic.has(path) ? optimistic.get(path)! : hidden.has(path);

  const toggle = async (path: string, hide: boolean) => {
    setBusy(path);
    setOptimistic((m) => { const n = new Map(m); n.set(path, hide); return n; });
    try {
      await setHidden({ data: { path, hidden: hide } });
      await refetch();
      toast.success(hide ? "Scheda nascosta a tutti" : "Scheda di nuovo visibile");
    } catch (e: any) {
      setOptimistic((m) => { const n = new Map(m); n.delete(path); return n; });
      toast.error(e?.message ?? "Errore");
    } finally {
      setBusy(null);
      setTimeout(() => setOptimistic((m) => { const n = new Map(m); n.delete(path); return n; }), 1000);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-2">
        Nascondi temporaneamente intere sezioni del sito. Tu continui a vederle.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        {HIDEABLE_ROUTES.map((r) => {
          const h = isHidden(r.path);
          return (
            <div key={r.path} className="field-panel flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                {h ? <EyeOff className="h-4 w-4 text-amber-600" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.path}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`vis-${r.path}`} className="text-xs text-muted-foreground">
                  {h ? "Nascosta" : "Visibile"}
                </Label>
                <Switch
                  id={`vis-${r.path}`}
                  checked={!h}
                  disabled={busy === r.path}
                  onCheckedChange={(v) => toggle(r.path, !v)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LockoutsSection() {
  const list = useServerFn(adminListLockouts);
  const reset = useServerFn(adminResetLockout);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { const r = await list() as any; setRows(r.rows ?? []); }
    catch (e: any) { toast.error(e?.message ?? "Errore"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const locked = rows.filter((r) => r.locked_until && new Date(r.locked_until).getTime() > Date.now());
  const handleReset = async (uname: string) => {
    try { await reset({ data: { username: uname } }); toast.success("Sblocco eseguito"); load(); }
    catch (e: any) { toast.error(e?.message ?? "Errore"); }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Blocco automatico per 15 minuti dopo 5 tentativi falliti. Sblocco manuale disponibile.
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">Nessun tentativo registrato.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utente</TableHead>
              <TableHead>Falliti</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Ultimo</TableHead>
              <TableHead className="text-right">Azione</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const isLocked = r.locked_until && new Date(r.locked_until).getTime() > Date.now();
              return (
                <TableRow key={r.username_lower}>
                  <TableCell className="font-medium">{r.username_lower}</TableCell>
                  <TableCell>{r.failed_count}</TableCell>
                  <TableCell>
                    {isLocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        <Lock className="h-3 w-3" /> Fino {format(new Date(r.locked_until), "HH:mm")}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Libero</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.last_attempt ? format(new Date(r.last_attempt), "dd/MM HH:mm:ss") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {(isLocked || r.failed_count > 0) && (
                      <Button size="sm" variant="outline" onClick={() => handleReset(r.username_lower)}>
                        <KeyRound className="h-3.5 w-3.5 mr-1" /> Sblocca
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {locked.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">{locked.length} account attualmente bloccato/i.</p>
      )}
    </div>
  );
}

function AuditLogSection() {
  const fetchLog = useServerFn(devListAuditLog);
  const [rows, setRows] = useState<any[]>([]);
  const [entity, setEntity] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [period, setPeriod] = useState<string>("7");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const since = period === "all" ? undefined : new Date(Date.now() - Number(period) * 86400000).toISOString();
      const r = await fetchLog({ data: {
        limit: 300,
        entity: entity === "all" ? undefined : entity || undefined,
        action: action === "all" ? undefined : action || undefined,
        search: search.trim() || undefined,
        since,
      } }) as any;
      setRows(r.rows ?? []);
    }
    catch (e: any) { toast.error(e?.message ?? "Errore"); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [entity, action, period, search]);
  const entities = [
    ["all", "Tutte le aree"], ["auth", "Accessi"], ["patients", "Pazienti"],
    ["interventions", "Interventi"], ["secondary_transports", "Trasporti"],
    ["sport_services", "Servizi sportivi"], ["office_services", "Ufficio"],
    ["checklist_items", "Checklist"], ["surveys", "Questionari"],
    ["areas", "Macro aree"], ["profiles", "Profili"], ["notifications", "Comunicazioni"],
  ];
  const entityLabel = (value: string) => ({
    auth: "Accessi", patients: "Pazienti", interventions: "Interventi", profiles: "Profili",
    user_roles: "Ruoli", user_permissions: "Permessi", office_services: "Servizi ufficio",
    office_service_types: "Tipi servizio ufficio", reports: "Segnalazioni", secondary_transports: "Trasporti secondari",
    transport_adi_routes: "Tratte ADI", transport_hospitals: "Ospedali", transport_intra_tariffs: "Tariffe ospedaliere",
    transport_tariffs: "Tariffe trasporti", sport_services: "Servizi sportivi", sport_vehicles: "Mezzi sportivi",
    sport_service_files: "Allegati sportivi", checklist_items: "Checklist", checklist_checks: "Controlli checklist",
    checklist_completions: "Completamenti checklist", surveys: "Questionari", survey_questions: "Domande questionario",
    survey_responses: "Risposte questionario", areas: "Macro aree", area_members: "Membri area",
    notifications: "Comunicazioni", notification_prefs: "Preferenze notifiche", site_customizations: "Personalizzazioni",
    app_settings: "Impostazioni", procedures: "Procedure", intervention_types: "Tipi intervento",
    inventory_items: "Inventario", operator_checkins: "Aperture", hidden_routes: "Visibilità schede",
    user_favorites: "Preferiti",
  } as Record<string, string>)[value] ?? value.replaceAll("_", " ");
  const labelFor = (a: string) => ({
    INSERT: "Creato", UPDATE: "Modificato", DELETE: "Eliminato",
    LOGIN_SUCCESS: "Login OK", LOGIN_FAILED: "Login fallito",
    LOGIN_LOCKED: "Bloccato", LOGIN_UNLOCKED: "Sbloccato",
  } as Record<string, string>)[a] ?? a;
  const counts = useMemo(() => ({
    total: rows.length,
    creates: rows.filter((row) => row.action === "INSERT").length,
    updates: rows.filter((row) => row.action === "UPDATE").length,
    users: new Set(rows.map((row) => row.actor_username).filter(Boolean)).size,
  }), [rows]);
  return (
    <section className="space-y-4 rounded-lg border bg-card/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg"><Activity className="h-5 w-5 text-primary" /> Attività del gestionale</h2>
          <p className="mt-1 text-xs text-muted-foreground">Azioni operative di tutte le sezioni, senza mostrare contenuti clinici o testuali.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Attività", counts.total], ["Creazioni", counts.creates], ["Modifiche", counts.updates], ["Operatori", counts.users]].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border bg-background px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca operatore o area" />
        </div>
        <Select value={entity || "all"} onValueChange={setEntity}>
          <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
          <SelectContent>{entities.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={action || "all"} onValueChange={setAction}>
          <SelectTrigger><SelectValue placeholder="Azione" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le azioni</SelectItem>
            <SelectItem value="INSERT">Creazioni</SelectItem><SelectItem value="UPDATE">Modifiche</SelectItem>
            <SelectItem value="DELETE">Eliminazioni</SelectItem><SelectItem value="LOGIN_SUCCESS">Accessi</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="1">Ultime 24 ore</SelectItem><SelectItem value="7">Ultimi 7 giorni</SelectItem><SelectItem value="30">Ultimi 30 giorni</SelectItem><SelectItem value="all">Tutto</SelectItem></SelectContent>
        </Select>
      </div>

      <div className="max-h-[560px] overflow-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Quando</TableHead>
              <TableHead>Chi</TableHead>
              <TableHead>Azione</TableHead>
              <TableHead>Sezione</TableHead>
              <TableHead>Dettaglio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">Nessuna voce.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(r.created_at), "dd/MM HH:mm:ss")}
                </TableCell>
                <TableCell className="text-sm">{r.actor_username ? formatOperator(r.actor_username) : "—"}</TableCell>
                <TableCell className="text-sm font-medium">{labelFor(r.action)}</TableCell>
                <TableCell className="text-sm">{entityLabel(r.entity)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[260px]">
                  {Array.isArray(r.details?.changed_fields) && r.details.changed_fields.length > 0
                    ? `${r.details.changed_fields.length} camp${r.details.changed_fields.length === 1 ? "o" : "i"}`
                    : r.entity_id ? `ID ${String(r.entity_id).slice(0, 8)}…` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function ActiveSessionsSection() {
  const list = useServerFn(devListActiveSessions);
  const revoke = useServerFn(devRevokeSession);
  const revokeAll = useServerFn(devRevokeAllUserSessions);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try { const r: any = await list(); setRows(r.rows ?? []); }
    catch (e: any) {
      const msg = e?.message ?? "Errore sconosciuto";
      setLoadError(msg);
      toast.error("Impossibile caricare le sessioni", { description: msg, duration: 8000 });
    }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleRevoke = async (row: any) => {
    if (!confirm(`Revocare questa sessione di "${row.username ?? row.user_id}"?`)) return;
    setBusy(row.session_id);
    try {
      const r: any = await revoke({ data: { userId: row.user_id, sessionId: row.session_id } });
      toast.success("Sessione revocata", {
        description: `Utente ${row.username ?? r.targetUser?.slice(0, 8)} · sess ${row.session_id.slice(0, 8)}… · righe rimosse ${r.revoked}`,
        duration: 7000,
      });
      load();
    } catch (e: any) {
      toast.error("Revoca fallita", { description: e?.message ?? "Errore", duration: 9000 });
    } finally { setBusy(null); }
  };

  const handleRevokeAll = async (userId: string, username: string | null, count: number) => {
    if (!confirm(`Revocare TUTTE le ${count} sessioni di "${username ?? userId}"?\nL'utente sarà disconnesso da ogni dispositivo.`)) return;
    setBusy(`all:${userId}`);
    try {
      const r: any = await revokeAll({ data: { userId } });
      toast.success(`Tutte le sessioni revocate`, {
        description: `Utente ${username ?? userId.slice(0, 8)} · sessioni ${r.revokedSessions} · refresh token ${r.revokedRefreshTokens}`,
        duration: 8000,
      });
      load();
    } catch (e: any) {
      toast.error("Revoca completa fallita", { description: e?.message ?? "Errore", duration: 9000 });
    } finally { setBusy(null); }
  };

  const parseUA = (ua: string | null) => {
    if (!ua) return "—";
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS · Safari";
    if (/Android/i.test(ua)) return "Android";
    if (/Edg\//i.test(ua)) return "Edge";
    if (/Chrome\//i.test(ua)) return "Chrome";
    if (/Firefox\//i.test(ua)) return "Firefox";
    if (/Safari\//i.test(ua)) return "Safari";
    return ua.slice(0, 40);
  };

  // Raggruppa per utente per contare le sessioni e mostrare il pulsante "revoca tutte"
  const countByUser = new Map<string, number>();
  rows.forEach((r) => countByUser.set(r.user_id, (countByUser.get(r.user_id) ?? 0) + 1));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {loadError ? "Errore di caricamento." : `${rows.length} sessioni attive su ${countByUser.size} utenti.`}
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {loadError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <div className="font-medium">Impossibile caricare le sessioni.</div>
          <div className="text-xs mt-1 font-mono break-all">{loadError}</div>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">Nessuna sessione attiva.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utente</TableHead>
                <TableHead>Dispositivo</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Aggiornata</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const n = countByUser.get(r.user_id) ?? 1;
                return (
                  <TableRow key={r.session_id}>
                    <TableCell className="font-medium">
                      {r.username ?? r.user_id.slice(0, 8)}
                      {n > 1 && <span className="ml-1 text-xs text-muted-foreground">({n} sess.)</span>}
                    </TableCell>
                    <TableCell className="text-xs">{parseUA(r.user_agent)}</TableCell>
                    <TableCell className="text-xs font-mono">{r.ip ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.updated_at ? format(new Date(r.updated_at), "dd/MM HH:mm") : "—"}</TableCell>
                    <TableCell className="text-xs">{r.not_after ? format(new Date(r.not_after), "dd/MM HH:mm") : "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost" size="icon"
                        title="Revoca questa sessione"
                        disabled={busy === r.session_id}
                        onClick={() => handleRevoke(r)}
                      ><LogOut className="h-4 w-4 text-amber-600" /></Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-red-600 hover:text-red-700"
                        title="Revoca TUTTE le sessioni di questo utente"
                        disabled={busy === `all:${r.user_id}`}
                        onClick={() => handleRevokeAll(r.user_id, r.username, n)}
                      >Tutte</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

