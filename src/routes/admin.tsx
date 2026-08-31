import { BackButton } from "@/components/BackHome";
import { PageHeader } from "@/components/PageHeader";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminCreateUser, adminListUsers, adminDeleteUser, adminResetPassword,
  adminSetPassword, adminRenameUser, adminSuspendUser, adminUnsuspendUser,
  adminUpdateUserPermissions, adminForceLogout,
  devSetUserJobTitle,
  adminListAnnouncements, adminGetAnnouncementRecipients,
  adminUpdateAnnouncement, adminDeleteAnnouncement,
} from "@/lib/api/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Trash2, UserPlus, KeyRound, Plus, Pencil, UserCog, Phone, CornerDownRight, Briefcase, ShieldCheck, Ban, ShieldAlert, SlidersHorizontal, LogOut, Megaphone, Eye, CheckCircle2, XCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { JobIcon, JOB_TITLES, type JobTitle } from "@/lib/job-titles";
import { AreasAdminPanel } from "@/components/AreasAdminPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";



export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin · Archivio clinico Punto Blu" },
      { name: "description", content: "Pannello amministrativo di Gestione S.O.G.IT.: utenti, permessi, macro aree e configurazioni operative." },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app/admin" },
      { property: "og:title", content: "Admin · Archivio clinico Punto Blu" },
      { property: "og:description", content: "Pannello amministrativo di Gestione S.O.G.IT.: utenti, permessi, macro aree e configurazioni operative." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Admin · Archivio clinico Punto Blu" },
      { name: "twitter:description", content: "Pannello amministrativo di Gestione S.O.G.IT.: utenti, permessi, macro aree e configurazioni operative." },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app/admin" }],
  }),
  component: AdminPage,
});

type IType = { id: string; name: string; sort_order: number; parent_id: string | null };

function AdminPage() {
  const navigate = useNavigate();
  const createUser = useServerFn(adminCreateUser);
  const listUsers = useServerFn(adminListUsers);
  const deleteUser = useServerFn(adminDeleteUser);
  const resetPw = useServerFn(adminResetPassword);
  const setPw = useServerFn(adminSetPassword);
  const renameUser = useServerFn(adminRenameUser);
  const suspendFn = useServerFn(adminSuspendUser);
  const unsuspendFn = useServerFn(adminUnsuspendUser);
  const updatePermsFn = useServerFn(adminUpdateUserPermissions);
  const forceLogoutFn = useServerFn(adminForceLogout);
  const setJobTitleFn = useServerFn(devSetUserJobTitle);
  const listAnnFn = useServerFn(adminListAnnouncements);
  const getAnnRecipientsFn = useServerFn(adminGetAnnouncementRecipients);
  const updateAnnFn = useServerFn(adminUpdateAnnouncement);
  const deleteAnnFn = useServerFn(adminDeleteAnnouncement);


  const [ready, setReady] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [username, setUsername] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [newJobTitle, setNewJobTitle] = useState<JobTitle>(null);
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [resetResult, setResetResult] = useState<{ username: string; tempPassword: string } | null>(null);
  const [pwUser, setPwUser] = useState<{ id: string; username: string } | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwMustChange, setPwMustChange] = useState(true);
  const [renameTarget, setRenameTarget] = useState<{ id: string; username: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [phoneTarget, setPhoneTarget] = useState<{ id: string; username: string } | null>(null);
  const [phoneValue, setPhoneValue] = useState("");
  const [suspendTarget, setSuspendTarget] = useState<any | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendUntil, setSuspendUntil] = useState("");
  const [permsTarget, setPermsTarget] = useState<any | null>(null);
  const [permsDraft, setPermsDraft] = useState({
    can_create_interventions: true,
    can_modify_own_interventions: true,
    can_view_others_interventions: true,
    can_manage_anagraphics: true,
  });

  // intervention types
  const [types, setTypes] = useState<IType[]>([]);
  const [newType, setNewType] = useState("");
  const [editType, setEditType] = useState<IType | null>(null);
  const [editTypeName, setEditTypeName] = useState("");
  const [childParent, setChildParent] = useState<IType | null>(null);
  const [childName, setChildName] = useState("");

  // office
  const [meId, setMeId] = useState<string>("");
  const [meUsername, setMeUsername] = useState<string>("");
  const [officeUserIds, setOfficeUserIds] = useState<Set<string>>(new Set());
  const isGabriele = meUsername === "Gabriele.Simonovich";
  const hasOffice = officeUserIds.has(meId);
  const [officeTypes, setOfficeTypes] = useState<IType[]>([]);
  const [newOfficeType, setNewOfficeType] = useState("");
  const [editOfficeType, setEditOfficeType] = useState<IType | null>(null);
  const [editOfficeTypeName, setEditOfficeTypeName] = useState("");
  const [officeChildParent, setOfficeChildParent] = useState<IType | null>(null);
  const [officeChildName, setOfficeChildName] = useState("");
  const [transportsUserIds, setTransportsUserIds] = useState<Set<string>>(new Set());
  const [sportUserIds, setSportUserIds] = useState<Set<string>>(new Set());

  // announcements
  type AnnGroup = { broadcast_id: string; title: string; body: string; created_at: string; recipients: number; acknowledged: number; read: number };
  const [announcements, setAnnouncements] = useState<AnnGroup[]>([]);
  const [annRecipients, setAnnRecipients] = useState<{ user_id: string; username: string; read_at: string | null; acknowledged_at: string | null }[] | null>(null);
  const [annViewing, setAnnViewing] = useState<AnnGroup | null>(null);
  const [annEditing, setAnnEditing] = useState<AnnGroup | null>(null);
  const [annEditTitle, setAnnEditTitle] = useState("");
  const [annEditBody, setAnnEditBody] = useState("");
  const [annBusy, setAnnBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/auth" }); return; }
      const [{ data: roles }, { data: prof }] = await Promise.all([
        supabase.from("user_roles" as any).select("role").eq("user_id", data.user.id),
        supabase.from("profiles" as any).select("username").eq("id", data.user.id).maybeSingle(),
      ]);
      if (!(roles as any)?.some((r: any) => r.role === "admin")) { navigate({ to: "/dashboard" }); return; }
      setIsDeveloper(((roles as any) ?? []).some((r: any) => r.role === "developer"));
      setMeId(data.user.id);
      setMeUsername((prof as any)?.username ?? "");
      setReady(true);
    })();
  }, []);

  const load = async () => {
    try {
      const u = await listUsers();
      setUsers(u as any[]);
      const { data: tps } = await supabase.from("intervention_types" as any).select("*").order("name");
      setTypes((tps as any) ?? []);
      // Office: roles (RLS filters: solo Gabriele vede tutto)
      const { data: officeRows } = await supabase.from("user_roles" as any).select("user_id").eq("role", "office");
      setOfficeUserIds(new Set(((officeRows as any) ?? []).map((r: any) => r.user_id)));
      // Office types (RLS: solo admin+office)
      const { data: ots } = await supabase.from("office_service_types" as any).select("*").order("name");
      setOfficeTypes((ots as any) ?? []);
      // Transports permission (visible to Gabriele via RLS)
      const { data: tperm } = await supabase.from("user_permissions" as any)
        .select("user_id, can_manage_transports, can_manage_sport");
      setTransportsUserIds(new Set(((tperm as any) ?? []).filter((p: any) => p.can_manage_transports).map((p: any) => p.user_id)));
      setSportUserIds(new Set(((tperm as any) ?? []).filter((p: any) => p.can_manage_sport).map((p: any) => p.user_id)));
      // Announcements
      try {
        const anns = await listAnnFn();
        setAnnouncements((anns as any) ?? []);
      } catch { /* non-blocking */ }
    } catch (err: any) { toast.error(err.message); }
  };
  useEffect(() => { if (ready) load(); }, [ready]);

  if (!ready) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    const p = tempPassword.trim();
    if (!u) return toast.error("Inserisci un nome utente");
    if (p.length < 6) return toast.error("Password min 6 caratteri");
    try {
      await createUser({ data: { username: u, tempPassword: p, isAdmin: makeAdmin, jobTitle: isDeveloper ? newJobTitle : null } });
      toast.success(`Utente "${u}" creato. Comunicagli la password temporanea: la dovrà cambiare al primo accesso.`);
      setUsername(""); setTempPassword(""); setMakeAdmin(false); setNewJobTitle(null); load();
    } catch (err: any) { toast.error(err.message); }
  };


  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questo utente?")) return;
    try { await deleteUser({ data: { userId: id } }); toast.success("Utente eliminato"); load(); }
    catch (err: any) { toast.error(err.message); }
  };

  const handleReset = async (id: string, uname: string) => {
    if (!confirm(`Generare una nuova password temporanea per ${uname}?`)) return;
    try {
      const r = await resetPw({ data: { userId: id } });
      setResetResult({ username: uname, tempPassword: (r as any).tempPassword });
      load();
    } catch (err: any) { toast.error(err.message); }
  };

  const openSetPassword = (u: any) => {
    setPwUser({ id: u.id, username: u.username });
    setPwValue(""); setPwMustChange(true);
  };
  const handleSetPassword = async () => {
    if (!pwUser) return;
    try {
      await setPw({ data: { userId: pwUser.id, newPassword: pwValue, mustChange: pwMustChange } });
      toast.success(`Password aggiornata per ${pwUser.username}`);
      setPwUser(null); load();
    } catch (err: any) { toast.error(err.message); }
  };

  const openRename = (u: any) => { setRenameTarget({ id: u.id, username: u.username }); setRenameValue(u.username); };
  const handleRename = async () => {
    if (!renameTarget) return;
    try {
      await renameUser({ data: { userId: renameTarget.id, newUsername: renameValue } });
      toast.success("Nome utente aggiornato");
      setRenameTarget(null); load();
    } catch (err: any) { toast.error(err.message); }
  };

  const openPhone = (u: any) => { setPhoneTarget({ id: u.id, username: u.username }); setPhoneValue(u.phone ?? ""); };
  const handleSavePhone = async () => {
    if (!phoneTarget) return;
    const v = phoneValue.trim();
    const { error } = await supabase.from("profiles" as any).update({ phone: v || null }).eq("id", phoneTarget.id);
    if (error) return toast.error(error.message);
    toast.success("Numero aggiornato"); setPhoneTarget(null); load();
  };

  const openSuspend = (u: any) => {
    setSuspendTarget(u);
    setSuspendReason(u.suspended_reason ?? "");
    setSuspendUntil(u.suspended_until ? new Date(u.suspended_until).toISOString().slice(0, 16) : "");
  };
  const handleSuspend = async () => {
    if (!suspendTarget) return;
    try {
      await suspendFn({ data: {
        userId: suspendTarget.id,
        reason: suspendReason,
        expiresAt: suspendUntil ? new Date(suspendUntil).toISOString() : null,
      }});
      toast.success(`Utente "${suspendTarget.username}" sospeso`);
      setSuspendTarget(null); load();
    } catch (err: any) { toast.error(err.message); }
  };
  const handleUnsuspend = async (u: any) => {
    if (!confirm(`Riattivare l'utente "${u.username}"?`)) return;
    try { await unsuspendFn({ data: { userId: u.id } }); toast.success("Utente riattivato"); load(); }
    catch (err: any) { toast.error(err.message); }
  };

  const openPerms = (u: any) => {
    setPermsTarget(u);
    setPermsDraft({
      can_create_interventions: u.permissions?.can_create_interventions ?? true,
      can_modify_own_interventions: u.permissions?.can_modify_own_interventions ?? true,
      can_view_others_interventions: u.permissions?.can_view_others_interventions ?? true,
      can_manage_anagraphics: u.permissions?.can_manage_anagraphics ?? true,
    });
  };
  const handleSavePerms = async () => {
    if (!permsTarget) return;
    try {
      await updatePermsFn({ data: { userId: permsTarget.id, ...permsDraft } });
      toast.success("Permessi aggiornati"); setPermsTarget(null); load();
    } catch (err: any) { toast.error(err.message); }
  };

  const addType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newType.trim()) return;
    const { error } = await supabase.from("intervention_types" as any).insert({ name: newType.trim(), sort_order: types.length, parent_id: null });
    if (error) return toast.error(error.message);
    setNewType(""); toast.success("Evento aggiunto"); load();
  };
  const addChild = async () => {
    if (!childParent || !childName.trim()) return;
    const { error } = await supabase.from("intervention_types" as any).insert({
      name: childName.trim(), sort_order: types.filter((t) => t.parent_id === childParent.id).length, parent_id: childParent.id,
    });
    if (error) return toast.error(error.message);
    setChildName(""); setChildParent(null); toast.success("Sotto-categoria aggiunta"); load();
  };
  const saveType = async () => {
    if (!editType) return;
    const { error } = await supabase.from("intervention_types" as any).update({ name: editTypeName.trim() }).eq("id", editType.id);
    if (error) return toast.error(error.message);
    setEditType(null); toast.success("Evento aggiornato"); load();
  };
  const deleteType = async (id: string) => {
    const hasChildren = types.some((t) => t.parent_id === id);
    const msg = hasChildren
      ? "Eliminare l'evento e tutte le sue sotto-categorie?"
      : "Eliminare l'evento?";
    if (!confirm(msg)) return;
    const { error } = await supabase.from("intervention_types" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Evento eliminato"); load();
  };

  // Office permission management (only Gabriele)
  const toggleOffice = async (userId: string, grant: boolean) => {
    if (grant) {
      const { error } = await supabase.from("user_roles" as any).insert({ user_id: userId, role: "office" });
      if (error) return toast.error(error.message);
      toast.success("Permesso ufficio concesso");
    } else {
      const { error } = await supabase.from("user_roles" as any).delete().eq("user_id", userId).eq("role", "office");
      if (error) return toast.error(error.message);
      toast.success("Permesso ufficio revocato");
    }
    load();
  };

  const toggleTransports = async (userId: string, grant: boolean) => {
    const { error } = await supabase.from("user_permissions" as any).upsert(
      { user_id: userId, can_manage_transports: grant, updated_by: meId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) return toast.error(error.message);
    toast.success(grant ? "Permesso Trasporti concesso" : "Permesso Trasporti revocato");
    load();
  };

  const toggleSport = async (userId: string, grant: boolean) => {
    const { error } = await supabase.from("user_permissions" as any).upsert(
      { user_id: userId, can_manage_sport: grant, updated_by: meId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) return toast.error(error.message);
    toast.success(grant ? "Permesso Servizi sportivi concesso" : "Permesso Servizi sportivi revocato");
    load();
  };


  // Office service types CRUD (only admin+office)
  const addOfficeType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficeType.trim()) return;
    const { error } = await supabase.from("office_service_types" as any).insert({ name: newOfficeType.trim(), sort_order: officeTypes.length, parent_id: null });
    if (error) return toast.error(error.message);
    setNewOfficeType(""); toast.success("Prestazione aggiunta"); load();
  };
  const addOfficeChild = async () => {
    if (!officeChildParent || !officeChildName.trim()) return;
    const { error } = await supabase.from("office_service_types" as any).insert({
      name: officeChildName.trim(),
      sort_order: officeTypes.filter((t) => t.parent_id === officeChildParent.id).length,
      parent_id: officeChildParent.id,
    });
    if (error) return toast.error(error.message);
    setOfficeChildName(""); setOfficeChildParent(null); toast.success("Sotto-categoria aggiunta"); load();
  };
  const saveOfficeType = async () => {
    if (!editOfficeType) return;
    const { error } = await supabase.from("office_service_types" as any).update({ name: editOfficeTypeName.trim() }).eq("id", editOfficeType.id);
    if (error) return toast.error(error.message);
    setEditOfficeType(null); toast.success("Prestazione aggiornata"); load();
  };
  const deleteOfficeType = async (id: string) => {
    const hasChildren = officeTypes.some((t) => t.parent_id === id);
    const msg = hasChildren ? "Eliminare la prestazione e tutte le sue sotto-categorie?" : "Eliminare la prestazione?";
    if (!confirm(msg)) return;
    const { error } = await supabase.from("office_service_types" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Prestazione eliminata"); load();
  };

  return (
    <div className="min-h-screen app-surface">
      <PageHeader
        tone="admin"
        icon={<ShieldCheck className="h-5 w-5" />}
        eyebrow="Riservato"
        title="Gestione admin"
        subtitle="Utenti, eventi, permessi."
      />

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="utenti" className="w-full">
          <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl p-1">
            <TabsTrigger value="utenti">Utenti</TabsTrigger>
            <TabsTrigger value="aree">Macro aree</TabsTrigger>
            <TabsTrigger value="comunicazioni">Comunicazioni</TabsTrigger>
            {isGabriele && <TabsTrigger value="permessi">Permessi</TabsTrigger>}
            <TabsTrigger value="config">Configurazione</TabsTrigger>
          </TabsList>

          <TabsContent value="utenti" className="space-y-6">

        
        <Card className="section-card" data-tone="admin">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><UserPlus className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Crea nuovo utente</CardTitle>
                <CardDescription className="leading-relaxed">L'utente userà la password temporanea che imposti qui e dovrà cambiarla al primo accesso.</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4" autoComplete="off">
              {/* Honeypot fields to deter Chrome/Safari autofill */}
              <input type="text" name="fakeusernameremembered" autoComplete="username" tabIndex={-1} aria-hidden="true" style={{ position: "absolute", opacity: 0, height: 0, width: 0, pointerEvents: "none" }} />
              <input type="password" name="fakepasswordremembered" autoComplete="current-password" tabIndex={-1} aria-hidden="true" style={{ position: "absolute", opacity: 0, height: 0, width: 0, pointerEvents: "none" }} />
              <div className="space-y-2"><Label>Nome utente</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name="new-user-name" /></div>
              <div className="space-y-2"><Label>Password temporanea</Label><Input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} required autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false} name="new-user-temp-pass" /></div>
              {isDeveloper && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Qualifica (solo programmatore)</Label>
                  <Select value={newJobTitle ?? "none"} onValueChange={(v) => setNewJobTitle(v === "none" ? null : (v as JobTitle))}>
                    <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuna</SelectItem>
                      {JOB_TITLES.map((j) => <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox id="admin" checked={makeAdmin} onCheckedChange={(v) => setMakeAdmin(!!v)} />
                <Label htmlFor="admin" className="cursor-pointer">Concedi autorizzazioni di amministratore</Label>
              </div>
              <Button type="submit" className="sm:col-span-2">Crea utente</Button>
            </form>



          </CardContent>
        </Card>

        <Card className="section-card" data-tone="admin">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><UserCog className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Utenti registrati</CardTitle>
                <CardDescription className="leading-relaxed">Modifica nome utente, telefono o password degli operatori.</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome utente</TableHead><TableHead>Ruolo</TableHead><TableHead>Stato</TableHead><TableHead>Telefono</TableHead><TableHead className="text-right">Azioni</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell><span className="inline-flex items-center gap-1.5">{u.username}<JobIcon username={u.username} /></span></TableCell>
                    <TableCell>{u.isAdmin ? "Admin" : "Utente"}</TableCell>
                    <TableCell>
                      {(() => {
                        const susp = u.suspended_at && (!u.suspended_until || new Date(u.suspended_until).getTime() > Date.now());
                        if (susp) return <span className="inline-flex items-center gap-1 text-destructive font-medium"><Ban className="h-3.5 w-3.5" /> Sospeso{u.suspended_until ? ` fino al ${new Date(u.suspended_until).toLocaleDateString("it-IT")}` : ""}</span>;
                        if (u.must_change_password) return "Cambio password richiesto";
                        return "Attivo";
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.phone || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" title="Modifica telefono" onClick={() => openPhone(u)}><Phone className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Modifica nome utente" onClick={() => openRename(u)}><UserCog className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Imposta password personalizzata" onClick={() => openSetPassword(u)}><KeyRound className="h-4 w-4" /></Button>
                      {(!u.isAdmin || isDeveloper) && (
                        <Button variant="ghost" size="icon" title={u.isAdmin ? "Qualifica (admin)" : "Permessi granulari"} onClick={() => openPerms(u)}><SlidersHorizontal className="h-4 w-4" /></Button>
                      )}
                      {u.username !== "Gabriele.Simonovich" && (
                        u.suspended_at && (!u.suspended_until || new Date(u.suspended_until).getTime() > Date.now())
                          ? <Button variant="ghost" size="icon" title="Riattiva utente" onClick={() => handleUnsuspend(u)}><ShieldCheck className="h-4 w-4 text-emerald-600" /></Button>
                          : <Button variant="ghost" size="icon" title="Sospendi utente" onClick={() => openSuspend(u)}><ShieldAlert className="h-4 w-4 text-amber-600" /></Button>
                      )}
                      {u.username !== "Gabriele.Simonovich" && (
                        <Button variant="ghost" size="icon" title="Disconnetti utente ora" onClick={async () => {
                          if (!confirm(`Disconnettere subito "${u.username}"? Dovrà rifare il login.`)) return;
                          try {
                            const r: any = await forceLogoutFn({ data: { userId: u.id } });
                            toast.success(`Utente "${u.username}" disconnesso`, {
                              description: `Sessioni revocate: ${r?.revokedSessions ?? 0} · refresh token: ${r?.revokedRefreshTokens ?? 0} · stamp ${r?.force_logout_at ? new Date(r.force_logout_at).toLocaleTimeString() : "-"}`,
                              duration: 8000,
                            });
                          } catch (e: any) {
                            toast.error(`Logout fallito per "${u.username}"`, {
                              description: e?.message ?? "Errore sconosciuto",
                              duration: 10000,
                            });
                          }
                        }}><LogOut className="h-4 w-4 text-blue-600" /></Button>
                      )}
                      {u.username !== "Gabriele.Simonovich" && (
                        <Button variant="ghost" size="icon" title="Elimina utente" onClick={() => handleDelete(u.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="aree" className="space-y-6">
        <AreasAdminPanel users={users as any} onUsersChanged={load} />
          </TabsContent>

          <TabsContent value="config" className="space-y-6">


        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><Plus className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Eventi</CardTitle>
                <CardDescription className="leading-relaxed">Gestisci gli eventi selezionabili dal menù a tendina nell'inserimento intervento. Puoi aggiungere sotto-categorie (es. <em>Ferita › Ferita lacero contusa</em>) per organizzare le casistiche più comuni.</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <form onSubmit={addType} className="flex gap-2">
              <Input placeholder="Nuovo evento principale" value={newType} onChange={(e) => setNewType(e.target.value)} />
              <Button type="submit">Aggiungi</Button>
            </form>
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead className="text-right">Azioni</TableHead></TableRow></TableHeader>
              <TableBody>
                {(() => {
                  const sortIt = (a: IType, b: IType) => a.name.localeCompare(b.name, "it", { sensitivity: "base" });
                  const parents = types.filter((t) => !t.parent_id).sort(sortIt);
                  const childrenOf = (pid: string) => types.filter((t) => t.parent_id === pid).sort(sortIt);
                  if (parents.length === 0) {
                    return <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Nessun evento</TableCell></TableRow>;
                  }
                  return parents.flatMap((p) => [
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" title="Aggiungi sotto-categoria" onClick={() => { setChildParent(p); setChildName(""); }}><Plus className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Rinomina" onClick={() => { setEditType(p); setEditTypeName(p.name); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Elimina" onClick={() => deleteType(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>,
                    ...childrenOf(p.id).map((c) => (
                      <TableRow key={c.id} className="bg-muted/30">
                        <TableCell className="pl-8 text-sm text-muted-foreground flex items-center gap-2">
                          <CornerDownRight className="h-3.5 w-3.5 opacity-60" /> {c.name}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" title="Rinomina" onClick={() => { setEditType(c); setEditTypeName(c.name); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Elimina" onClick={() => deleteType(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    )),
                  ]);
                })()}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="comunicazioni" className="space-y-6">

        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><Megaphone className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Comunicazioni</CardTitle>
                <CardDescription className="leading-relaxed">Visualizza chi ha preso visione delle comunicazioni inviate, modificale o eliminale per tutti i destinatari.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Titolo</TableHead>
                <TableHead>Inviata il</TableHead>
                <TableHead className="text-right">Presa visione</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {announcements.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nessuna comunicazione inviata</TableCell></TableRow>
                )}
                {announcements.map((a) => (
                  <TableRow key={a.broadcast_id}>
                    <TableCell className="font-medium max-w-[280px] truncate">{a.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(a.created_at).toLocaleString("it-IT")}</TableCell>
                    <TableCell className="text-right text-sm">
                      <span className={a.acknowledged === a.recipients ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
                        {a.acknowledged} / {a.recipients}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" title="Vedi destinatari" onClick={async () => {
                        setAnnViewing(a);
                        try { const r = await getAnnRecipientsFn({ data: { broadcastId: a.broadcast_id } }); setAnnRecipients(r as any); }
                        catch (e: any) { toast.error(e?.message ?? "Errore"); }
                      }}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Modifica" onClick={() => {
                        setAnnEditing(a);
                        // Rimuovo la firma automatica se presente
                        const cleaned = a.body.replace(/\n\n— [^\n]+$/, "");
                        setAnnEditTitle(a.title); setAnnEditBody(cleaned);
                      }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Elimina" onClick={async () => {
                        if (!confirm(`Eliminare la comunicazione "${a.title}" per tutti i destinatari?`)) return;
                        try {
                          const r: any = await deleteAnnFn({ data: { broadcastId: a.broadcast_id } });
                          toast.success(`Eliminata (${r?.deleted ?? 0} righe)`);
                          load();
                        } catch (e: any) { toast.error(e?.message ?? "Errore"); }
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="permessi" className="space-y-6">

        {isGabriele && (
          <Card className="section-card" data-tone="admin">
            <CardHeader className="section-header">
              <div className="flex items-start gap-3">
                <div className="icon-chip"><ShieldCheck className="h-5 w-5" /></div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-display text-xl tracking-tight">Permessi ufficio</CardTitle>
                  <CardDescription className="leading-relaxed">Concedi il permesso "Prestazioni ufficio" agli amministratori autorizzati. Solo gli admin con questo permesso aggiuntivo possono accedere alla scheda riservata.</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nome utente</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead className="text-right">Permesso ufficio</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {users.filter((u) => u.isAdmin).map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell className="text-muted-foreground">Admin</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-muted-foreground">{officeUserIds.has(u.id) ? "Attivo" : "Disattivo"}</span>
                          <Switch
                            checked={officeUserIds.has(u.id)}
                            onCheckedChange={(v) => toggleOffice(u.id, !!v)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.filter((u) => u.isAdmin).length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nessun amministratore registrato</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {isGabriele && (
          <Card className="section-card" data-tone="admin">
            <CardHeader className="section-header">
              <div className="flex items-start gap-3">
                <div className="icon-chip"><ShieldCheck className="h-5 w-5" /></div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-display text-xl tracking-tight">Permessi sezioni riservate</CardTitle>
                  <CardDescription className="leading-relaxed">Concedi l'accesso alle schede "Trasporti secondari" e "Servizi sportivi" agli admin autorizzati.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nome utente</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead className="text-right">Trasporti secondari</TableHead>
                  <TableHead className="text-right">Servizi sportivi</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {users.filter((u) => u.isAdmin).map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell className="text-muted-foreground">Admin</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-muted-foreground">{transportsUserIds.has(u.id) ? "Attivo" : "Disattivo"}</span>
                          <Switch checked={transportsUserIds.has(u.id)} onCheckedChange={(v) => toggleTransports(u.id, !!v)} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-muted-foreground">{sportUserIds.has(u.id) ? "Attivo" : "Disattivo"}</span>
                          <Switch checked={sportUserIds.has(u.id)} onCheckedChange={(v) => toggleSport(u.id, !!v)} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
          </TabsContent>

          <TabsContent value="config" className="space-y-6">

        {hasOffice && (
          <Card className="section-card" data-tone="office">
            <CardHeader className="section-header">
              <div className="flex items-start gap-3">
                <div className="icon-chip"><Briefcase className="h-5 w-5" /></div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-display text-xl tracking-tight">Prestazioni ufficio · Tipologie</CardTitle>
                  <CardDescription className="leading-relaxed">Gestisci le prestazioni selezionabili nella scheda "Prestazioni ufficio". Sono indipendenti dagli eventi clinici. Puoi aggiungere sotto-categorie.</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <form onSubmit={addOfficeType} className="flex gap-2">
                <Input placeholder="Nuova prestazione principale" value={newOfficeType} onChange={(e) => setNewOfficeType(e.target.value)} />
                <Button type="submit">Aggiungi</Button>
              </form>
              <Table>
                <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead className="text-right">Azioni</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(() => {
                    const sortIt = (a: IType, b: IType) => a.name.localeCompare(b.name, "it", { sensitivity: "base" });
                    const parents = officeTypes.filter((t) => !t.parent_id).sort(sortIt);
                    const childrenOf = (pid: string) => officeTypes.filter((t) => t.parent_id === pid).sort(sortIt);
                    if (parents.length === 0) {
                      return <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Nessuna prestazione</TableCell></TableRow>;
                    }
                    return parents.flatMap((p) => [
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" title="Aggiungi sotto-categoria" onClick={() => { setOfficeChildParent(p); setOfficeChildName(""); }}><Plus className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Rinomina" onClick={() => { setEditOfficeType(p); setEditOfficeTypeName(p.name); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Elimina" onClick={() => deleteOfficeType(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>,
                      ...childrenOf(p.id).map((c) => (
                        <TableRow key={c.id} className="bg-muted/30">
                          <TableCell className="pl-8 text-sm text-muted-foreground flex items-center gap-2">
                            <CornerDownRight className="h-3.5 w-3.5 opacity-60" /> {c.name}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" title="Rinomina" onClick={() => { setEditOfficeType(c); setEditOfficeTypeName(c.name); }}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Elimina" onClick={() => deleteOfficeType(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </TableCell>
                        </TableRow>
                      )),
                    ]);
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
          </TabsContent>
        </Tabs>
      </main>


      <Dialog open={!!officeChildParent} onOpenChange={(o) => !o && setOfficeChildParent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi sotto-categoria prestazione</DialogTitle>
            <DialogDescription>
              Aggiungi una sotto-categoria sotto <strong>{officeChildParent?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus placeholder="Nome sotto-categoria" value={officeChildName} onChange={(e) => setOfficeChildName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOfficeChild(); } }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfficeChildParent(null)}>Annulla</Button>
            <Button onClick={addOfficeChild}>Aggiungi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editOfficeType} onOpenChange={(o) => !o && setEditOfficeType(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifica prestazione</DialogTitle></DialogHeader>
          <Input value={editOfficeTypeName} onChange={(e) => setEditOfficeTypeName(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setEditOfficeType(null)}>Annulla</Button><Button onClick={saveOfficeType}>Salva</Button></DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={!!childParent} onOpenChange={(o) => !o && setChildParent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi sotto-categoria</DialogTitle>
            <DialogDescription>
              Aggiungi una sotto-categoria sotto <strong>{childParent?.name}</strong> (es. <em>{childParent?.name} lacero contusa</em>).
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus placeholder="Nome sotto-categoria"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChild(); } }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setChildParent(null)}>Annulla</Button>
            <Button onClick={addChild}>Aggiungi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetResult} onOpenChange={(o) => !o && setResetResult(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuova password temporanea</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Comunica questa password a <strong>{resetResult?.username}</strong>. Dovrà cambiarla al prossimo accesso.</p>
            <div className="p-3 rounded-md bg-muted font-mono text-lg select-all text-center">{resetResult?.tempPassword}</div>
          </div>
          <DialogFooter><Button onClick={() => setResetResult(null)}>Chiudi</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editType} onOpenChange={(o) => !o && setEditType(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifica evento</DialogTitle></DialogHeader>
          <Input value={editTypeName} onChange={(e) => setEditTypeName(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setEditType(null)}>Annulla</Button><Button onClick={saveType}>Salva</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica nome utente</DialogTitle>
            <DialogDescription>
              Cambia il nome utente di <strong>{renameTarget?.username}</strong>. Verrà usato per accedere.
            </DialogDescription>
          </DialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Nuovo nome utente" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Annulla</Button>
            <Button onClick={handleRename}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwUser} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Imposta password personalizzata</DialogTitle>
            <DialogDescription>
              Imposta una password specifica per <strong>{pwUser?.username}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nuova password</Label>
              <Input type="text" value={pwValue} onChange={(e) => setPwValue(e.target.value)} placeholder="Min 6 caratteri" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="pwmc" checked={pwMustChange} onCheckedChange={(v) => setPwMustChange(!!v)} />
              <Label htmlFor="pwmc" className="cursor-pointer">Richiedi cambio password al prossimo accesso</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwUser(null)}>Annulla</Button>
            <Button onClick={handleSetPassword}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!phoneTarget} onOpenChange={(o) => !o && setPhoneTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Numero di cellulare</DialogTitle>
            <DialogDescription>Aggiorna il numero di cellulare di <strong>{phoneTarget?.username}</strong>. Lascia vuoto per rimuoverlo.</DialogDescription>
          </DialogHeader>
          <Input inputMode="tel" placeholder="es. +39 333 1234567" value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhoneTarget(null)}>Annulla</Button>
            <Button onClick={handleSavePhone}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!suspendTarget} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-600" /> Sospendi utente</DialogTitle>
            <DialogDescription>
              Sospendi <strong>{suspendTarget?.username}</strong>. L'utente verrà disconnesso subito e non potrà più accedere fino al termine della sospensione.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Motivo (visibile all'utente al login)</Label>
              <Input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} placeholder="es. Verifica documentazione in corso" />
            </div>
            <div className="space-y-2">
              <Label>Fine sospensione <span className="text-muted-foreground font-normal">(vuoto = a tempo indeterminato)</span></Label>
              <Input type="datetime-local" value={suspendUntil} onChange={(e) => setSuspendUntil(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>Annulla</Button>
            <Button variant="destructive" onClick={handleSuspend}>Sospendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!permsTarget} onOpenChange={(o) => !o && setPermsTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" /> Permessi · {permsTarget?.username}</DialogTitle>
            <DialogDescription>Abilita o disabilita singole funzionalità per questo utente. Gli amministratori hanno sempre tutti i permessi.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!permsTarget?.isAdmin && ([
              ["can_create_interventions", "Registrare nuovi interventi"],
              ["can_modify_own_interventions", "Modificare i propri interventi"],
              ["can_view_others_interventions", "Vedere gli interventi degli altri operatori"],
              ["can_manage_anagraphics", "Gestire l'anagrafica pazienti"],
            ] as const).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
                <Label className="cursor-pointer" htmlFor={`perm-${k}`}>{label}</Label>
                <Switch id={`perm-${k}`} checked={(permsDraft as any)[k]} onCheckedChange={(v) => setPermsDraft((d) => ({ ...d, [k]: !!v }))} />
              </div>
            ))}
            {permsTarget?.isAdmin && (
              <div className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
                Gli amministratori dispongono automaticamente di tutti i permessi operativi.
              </div>
            )}
            {isDeveloper && permsTarget && (
              <div className="rounded-lg border bg-card px-3 py-2 space-y-2">
                <Label>Qualifica (solo programmatore)</Label>
                <Select
                  value={permsTarget.job_title ?? "none"}
                  onValueChange={async (v) => {
                    const jt = v === "none" ? null : (v as JobTitle);
                    try {
                      await setJobTitleFn({ data: { userId: permsTarget.id, jobTitle: jt } });
                      toast.success("Qualifica aggiornata");
                      setPermsTarget({ ...permsTarget, job_title: jt });
                      load();
                    } catch (e: any) { toast.error(e?.message ?? "Errore"); }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuna</SelectItem>
                    {JOB_TITLES.map((j) => <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermsTarget(null)}>Chiudi</Button>
            {!permsTarget?.isAdmin && <Button onClick={handleSavePerms}>Salva permessi</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comunicazione: destinatari e presa visione */}
      <Dialog open={!!annViewing} onOpenChange={(o) => { if (!o) { setAnnViewing(null); setAnnRecipients(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" /> {annViewing?.title}</DialogTitle>
            <DialogDescription>
              Inviata il {annViewing ? new Date(annViewing.created_at).toLocaleString("it-IT") : ""} · {annViewing?.acknowledged}/{annViewing?.recipients} presa visione
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Utente</TableHead>
                <TableHead>Letta</TableHead>
                <TableHead>Presa visione</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {annRecipients === null && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Caricamento…</TableCell></TableRow>
                )}
                {annRecipients?.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-medium">{r.username}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.read_at ? new Date(r.read_at).toLocaleString("it-IT") : <span className="inline-flex items-center gap-1 text-muted-foreground"><XCircle className="h-3.5 w-3.5" /> —</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.acknowledged_at
                        ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> {new Date(r.acknowledged_at).toLocaleString("it-IT")}</span>
                        : <span className="inline-flex items-center gap-1 text-amber-600"><XCircle className="h-3.5 w-3.5" /> In attesa</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setAnnViewing(null); setAnnRecipients(null); }}>Chiudi</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comunicazione: modifica */}
      <Dialog open={!!annEditing} onOpenChange={(o) => !o && setAnnEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" /> Modifica comunicazione</DialogTitle>
            <DialogDescription>Le modifiche verranno applicate per tutti i destinatari. Chi ha già preso visione non riceverà un nuovo avviso bloccante.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Titolo</Label><Input value={annEditTitle} onChange={(e) => setAnnEditTitle(e.target.value)} maxLength={200} /></div>
            <div className="space-y-1"><Label>Testo</Label><Textarea value={annEditBody} onChange={(e) => setAnnEditBody(e.target.value)} maxLength={4000} rows={6} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnEditing(null)}>Annulla</Button>
            <Button disabled={annBusy || !annEditTitle.trim() || !annEditBody.trim()} onClick={async () => {
              if (!annEditing) return;
              setAnnBusy(true);
              try {
                await updateAnnFn({ data: { broadcastId: annEditing.broadcast_id, title: annEditTitle.trim(), body: annEditBody.trim() } });
                toast.success("Comunicazione aggiornata");
                setAnnEditing(null); load();
              } catch (e: any) { toast.error(e?.message ?? "Errore"); }
              finally { setAnnBusy(false); }
            }}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
