import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bell, Volume2, MessageSquare, Monitor, Save, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  KNOWN_KINDS,
  isKindEnabled,
  saveAdminCache,
  useOverrides,
  type NotifPrefs,
} from "@/lib/notification-prefs";
import {
  getMyNotifPrefs,
  adminListNotifPrefs,
  adminSetNotifPrefs,
} from "@/lib/api/notif-prefs.functions";

export const Route = createFileRoute("/impostazioni-notifiche")({
  head: () => ({
    meta: [
      { title: "Impostazioni notifiche" },
      { name: "description", content: "Impostazioni delle notifiche gestite dall'admin." },
      { property: "og:url", content: "https://your-domain.example/impostazioni-notifiche" },
      { property: "og:title", content: "Impostazioni notifiche" },
      { property: "og:description", content: "Impostazioni delle notifiche gestite dall'admin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Impostazioni notifiche" },
      { name: "twitter:description", content: "Impostazioni delle notifiche gestite dall'admin." },
    ],
    links: [{ rel: "canonical", href: "https://your-domain.example/impostazioni-notifiche" }],
  }),
  component: NotifSettings,
});

type ListRow = { user_id: string; username: string; prefs: NotifPrefs & { user_id: string; updated_at: string; updated_by: string | null } };

function NotifSettings() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;
      setMyUserId(uid);
      if (!uid) { setLoading(false); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      setIsAdmin(((data as any[]) ?? []).some((r) => r.role === "admin"));
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="container mx-auto max-w-2xl px-4 py-6 text-sm text-muted-foreground">Caricamento…</div>;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" /> Indietro</Link></Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Bell className="h-6 w-6" /> Impostazioni notifiche</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin
            ? "Gestisci canali e tipi di comunicazione per ogni utente."
            : "Le comunicazioni che ricevi sono decise dall'admin. Su questo dispositivo puoi solo disattivarle ulteriormente."}
        </p>
      </div>

      {isAdmin ? <AdminEditor /> : (myUserId ? <UserView /> : null)}
    </div>
  );
}

// ================= ADMIN =================
function AdminEditor() {
  const listFn = useServerFn(adminListNotifPrefs);
  const saveFn = useServerFn(adminSetNotifPrefs);
  const [rows, setRows] = useState<ListRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<NotifPrefs>({ toast: true, sound: true, browser: true, kinds: {} });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await listFn();
      setRows(r as ListRow[]);
      if (!selectedId && (r as ListRow[]).length > 0) setSelectedId((r as ListRow[])[0].user_id);
    } catch (e: any) { toast.error(e?.message ?? "Errore caricamento"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const selected = useMemo(() => rows.find((r) => r.user_id === selectedId), [rows, selectedId]);
  useEffect(() => {
    if (!selected) return;
    setDraft({
      toast: selected.prefs.toast, sound: selected.prefs.sound, browser: selected.prefs.browser,
      kinds: { ...(selected.prefs.kinds ?? {}) },
    });
  }, [selected]);

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await saveFn({ data: { userId: selectedId, ...draft } });
      toast.success("Preferenze salvate");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Errore salvataggio"); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utente</CardTitle>
          <CardDescription>Scegli l'utente di cui modificare le preferenze.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder={loading ? "Caricamento…" : "Seleziona utente"} /></SelectTrigger>
            <SelectContent>
              {rows.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.username}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canali</CardTitle>
          <CardDescription>Come l'utente riceve gli avvisi.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row icon={<MessageSquare className="h-4 w-4" />} title="Toast in-app" desc="Riquadro in basso all'arrivo."
            checked={draft.toast} onCheckedChange={(v) => setDraft({ ...draft, toast: v })} />
          <Separator />
          <Row icon={<Volume2 className="h-4 w-4" />} title="Suono" desc="Breve suono all'arrivo."
            checked={draft.sound} onCheckedChange={(v) => setDraft({ ...draft, sound: v })} />
          <Separator />
          <Row icon={<Monitor className="h-4 w-4" />} title="Notifiche del browser" desc="Notifica di sistema fuori dalla scheda."
            checked={draft.browser} onCheckedChange={(v) => setDraft({ ...draft, browser: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tipi di comunicazione</CardTitle>
          <CardDescription>Solo i tipi attivi genereranno toast, suono e notifica di sistema.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {KNOWN_KINDS.map((k, i) => (
            <div key={k.key}>
              {i > 0 && <Separator className="mb-3" />}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{k.label}</Label>
                  <p className="text-xs text-muted-foreground">{k.description}</p>
                </div>
                <Switch checked={isKindEnabled(draft, k.key)}
                  onCheckedChange={(v) => setDraft({ ...draft, kinds: { ...draft.kinds, [k.key]: v } })} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={!selectedId || saving}>
          <Save className="h-4 w-4 mr-2" /> {saving ? "Salvataggio…" : "Salva"}
        </Button>
      </div>
    </>
  );
}

// ================= USER =================
function UserView() {
  const getFn = useServerFn(getMyNotifPrefs);
  const [admin, setAdmin] = useState<NotifPrefs | null>(null);
  const [overrides, setOverrides] = useOverrides();

  useEffect(() => {
    (async () => {
      try {
        const r: any = await getFn();
        const p: NotifPrefs = { toast: r.toast, sound: r.sound, browser: r.browser, kinds: r.kinds ?? {} };
        setAdmin(p);
        saveAdminCache(p);
      } catch (e: any) { toast.error(e?.message ?? "Errore caricamento"); }
    })();
  }, [getFn]);

  const requestBrowser = async () => {
    if (typeof Notification === "undefined") { toast.error("Notifiche browser non supportate"); return; }
    if (Notification.permission === "granted") { toast("Già attive"); return; }
    try {
      const p = await Notification.requestPermission();
      if (p === "granted") toast.success("Notifiche del browser attivate");
      else toast("Permesso non concesso");
    } catch { toast.error("Non supportato da questo browser"); }
  };

  if (!admin) return <div className="text-sm text-muted-foreground">Caricamento…</div>;

  const setChan = (k: "toast" | "sound" | "browser", v: boolean) => setOverrides({ ...overrides, [k]: v });
  const setKind = (k: string, v: boolean) => setOverrides({ ...overrides, kinds: { ...overrides.kinds, [k]: v } });

  const browserPerm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";

  return (
    <>
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Le voci disattivate dall'admin non possono essere riattivate. Puoi solo <b>disattivare</b> ulteriormente per questo dispositivo.
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canali</CardTitle>
          <CardDescription>Su questo dispositivo/browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <UserRow icon={<MessageSquare className="h-4 w-4" />} title="Toast in-app"
            adminOn={admin.toast} userOn={overrides.toast}
            onChange={(v) => setChan("toast", v)} />
          <Separator />
          <UserRow icon={<Volume2 className="h-4 w-4" />} title="Suono"
            adminOn={admin.sound} userOn={overrides.sound}
            onChange={(v) => setChan("sound", v)} />
          <Separator />
          <div>
            <UserRow icon={<Monitor className="h-4 w-4" />} title="Notifiche del browser"
              adminOn={admin.browser} userOn={overrides.browser}
              onChange={(v) => setChan("browser", v)} />
            {admin.browser && browserPerm === "default" && (
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={requestBrowser}>Richiedi permesso</Button>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Stato permesso browser: {browserPerm === "granted" ? "concesso" : browserPerm === "denied" ? "bloccato" : browserPerm === "default" ? "non richiesto" : "non supportato"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tipi di comunicazione</CardTitle>
          <CardDescription>I tipi disattivati dall'admin restano bloccati.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {KNOWN_KINDS.map((k, i) => {
            const adminOn = isKindEnabled(admin, k.key);
            const userOn = isKindEnabled(overrides, k.key);
            return (
              <div key={k.key}>
                {i > 0 && <Separator className="mb-3" />}
                <UserRow
                  title={k.label}
                  desc={k.description}
                  adminOn={adminOn}
                  userOn={userOn}
                  onChange={(v) => setKind(k.key, v)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

function Row({ icon, title, desc, checked, onCheckedChange }: {
  icon: React.ReactNode; title: string; desc: string;
  checked: boolean; onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function UserRow({ icon, title, desc, adminOn, userOn, onChange }: {
  icon?: React.ReactNode; title: string; desc?: string;
  adminOn: boolean; userOn: boolean; onChange: (v: boolean) => void;
}) {
  const effective = adminOn && userOn;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
          {!adminOn && <p className="text-[11px] text-destructive mt-0.5">Disattivato dall'admin</p>}
        </div>
      </div>
      <Switch checked={effective} disabled={!adminOn}
        onCheckedChange={(v) => onChange(v)} />
    </div>
  );
}
