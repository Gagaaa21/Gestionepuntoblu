import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Check, CheckCheck, Megaphone, Send, Settings, Users, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { adminBroadcastAnnouncement, adminListBroadcastTargets } from "@/lib/api/admin.functions";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { isKindEnabled, loadEffective, saveAdminCache, type NotifPrefs } from "@/lib/notification-prefs";
import { getMyNotifPrefs } from "@/lib/api/notif-prefs.functions";

type Notif = {
  id: string; title: string; body: string | null; kind: string | null;
  link: string | null; read_at: string | null; created_at: string;
};

export function NotificationsBell({ userId, isAdmin = false }: { userId: string; isAdmin?: boolean }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [targets, setTargets] = useState<{ id: string; username: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toAll, setToAll] = useState(true);
  


  const broadcastFn = useServerFn(adminBroadcastAnnouncement);
  const listTargetsFn = useServerFn(adminListBroadcastTargets);

  const load = async () => {
    const { data } = await supabase
      .from("notifications" as any)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as any) ?? []);
  };

  const playPing = () => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.4);
      setTimeout(() => ctx.close().catch(() => {}), 600);
    } catch { /* silenzioso */ }
  };

  const getMyPrefsFn = useServerFn(getMyNotifPrefs);

  // Sync admin-defined prefs into local cache (used by effective prefs).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const r: any = await getMyPrefsFn();
        if (cancelled) return;
        const p: NotifPrefs = { toast: !!r.toast, sound: !!r.sound, browser: !!r.browser, kinds: r.kinds ?? {} };
        saveAdminCache(p);
      } catch { /* silent */ }
    };
    refresh();
    let ch: any;
    try {
      ch = supabase
        .channel(`notif-prefs-${userId}-${Math.random().toString(36).slice(2, 7)}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "notification_prefs", filter: `user_id=eq.${userId}` },
          refresh)
        .subscribe();
    } catch { /* channel already registered — safe to ignore */ }
    return () => { cancelled = true; if (ch) { try { supabase.removeChannel(ch); } catch {} } };
  }, [userId, getMyPrefsFn]);


  useEffect(() => {
    if (!userId) return;
    load();
    const ch = supabase
      .channel(`notif-${userId}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as Notif;
          load();
          const p = loadEffective();
          const allowed = isKindEnabled(p, n.kind);
          if (!allowed) return;
          // Notifica di sistema del browser (se abilitata e permessa)
          if (p.browser && typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(n.title || "Nuova comunicazione", {
                body: n.body ?? "",
                icon: "/favicon.ico",
                tag: n.id,
              });
            } catch { /* alcuni browser lo bloccano fuori da SW */ }
          }
          // Toast in-app
          if (p.toast) {
            toast(n.title || "Nuova comunicazione", {
              description: n.body ?? undefined,
              duration: 6000,
              action: n.link ? { label: "Apri", onClick: () => { window.location.href = n.link!; } } : undefined,
            });
          }
          if (p.sound) playPing();
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const unread = items.filter((n) => !n.read_at).length;

  const markRead = async (id: string) => {
    const ts = new Date().toISOString();
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read_at: ts } : n));
    const { error } = await supabase.from("notifications" as any)
      .update({ read_at: ts }).eq("id", id).eq("user_id", userId);
    if (error) { toast.error("Impossibile segnare come letta: " + error.message); load(); }
  };
  const markAll = async () => {
    const ts = new Date().toISOString();
    setItems((prev) => prev.map((n) => n.read_at ? n : { ...n, read_at: ts }));
    const { error } = await supabase.from("notifications" as any)
      .update({ read_at: ts })
      .eq("user_id", userId).is("read_at", null);
    if (error) { toast.error("Errore: " + error.message); load(); }
    else toast.success("Notifiche segnate come lette");
  };

  const openCompose = async () => {
    setComposeOpen(true);
    try {
      const r: any = await listTargetsFn();
      setTargets(r as any[]);
    } catch (e: any) { toast.error(e?.message ?? "Errore caricamento utenti"); }
  };

  const send = async () => {
    setSending(true);
    try {
      const userIds = toAll ? null : Array.from(selected);
      if (!toAll && userIds!.length === 0) { toast.error("Seleziona almeno un destinatario"); setSending(false); return; }
      const r: any = await broadcastFn({ data: { title: title.trim(), body: body.trim(), userIds } });
      toast.success(`Comunicazione inviata a ${r.delivered} utenti`);
      setTitle(""); setBody(""); setSelected(new Set()); setToAll(true); setComposeOpen(false);
    } catch (e: any) { toast.error(e?.message ?? "Errore invio"); }
    finally { setSending(false); }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="nav-tile relative" aria-label="Notifiche">
            <span className="nav-tile-icon"><Bell className="h-4 w-4" /></span>
            Notifiche
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground ring-2 ring-background">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-medium">Notifiche</p>
            <div className="flex items-center gap-1">
              {typeof Notification !== "undefined" && Notification.permission === "default" && (
                <Button
                  variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={async () => {
                    try {
                      const p = await Notification.requestPermission();
                      if (p === "granted") toast.success("Notifiche del browser attivate");
                      else toast("Permesso non concesso");
                    } catch { toast.error("Non supportato da questo browser"); }
                  }}
                >
                  <Bell className="h-3.5 w-3.5 mr-1" /> Attiva
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setOpen(false); openCompose(); }}>
                <Megaphone className="h-3.5 w-3.5 mr-1" /> Scrivi
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild aria-label="Impostazioni notifiche">
                <Link to="/impostazioni-notifiche" onClick={() => setOpen(false)}>
                  <Settings className="h-3.5 w-3.5" />
                </Link>
              </Button>
              {unread > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAll}>
                  <CheckCheck className="h-3.5 w-3.5 mr-1" /> Segna tutte
                </Button>
              )}
            </div>
          </div>
          <ScrollArea className="max-h-96">
            {items.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Nessuna notifica</div>
            ) : (
              <ul className="divide-y">
                {items.map((n) => (
                  <li key={n.id} className={`p-3 text-sm ${!n.read_at ? "bg-primary/5" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground/90 truncate">{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {format(new Date(n.created_at), "d MMM yyyy, HH:mm", { locale: it })}
                        </p>
                      </div>
                      {!n.read_at && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => markRead(n.id)} aria-label="Segna come letta">
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" /> Invia comunicazione</DialogTitle>
            <DialogDescription>
              I destinatari vedranno un avviso bloccante e dovranno confermare la presa visione. Il messaggio resterà consultabile nelle loro notifiche.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Titolo</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="es. Aggiornamento turni" /></div>
            <div className="space-y-1"><Label>Testo</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={5} placeholder="Scrivi qui la comunicazione…" /></div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <Checkbox id="ann-all" checked={toAll} onCheckedChange={(v) => { setToAll(!!v); if (v) setSelected(new Set()); }} />
              <Label htmlFor="ann-all" className="cursor-pointer flex items-center gap-2"><Users className="h-4 w-4" /> Invia a tutti gli utenti</Label>
            </div>
            {!toAll && (
              <div className="space-y-2">
                <Label>Destinatari selezionati ({selected.size})</Label>
                <ScrollArea className="h-52 rounded-lg border bg-card">
                  <ul className="p-2">
                    {targets.map((t) => {
                      const active = selected.has(t.id);
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => toggle(t.id)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm text-left ${active ? "bg-primary/10 text-foreground" : "hover:bg-muted"}`}
                          >
                            <span>{t.username}</span>
                            {active ? <Check className="h-4 w-4 text-primary" /> : <span className="h-4 w-4 rounded border border-muted-foreground/30" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}><X className="h-4 w-4 mr-1" /> Annulla</Button>
            <Button disabled={sending || !title.trim() || !body.trim()} onClick={send}>
              <Send className="h-4 w-4 mr-2" /> Invia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
