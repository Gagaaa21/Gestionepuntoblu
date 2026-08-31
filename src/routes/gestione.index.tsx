import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMyAreas, type AreaRow } from "@/lib/api/areas.functions";
import { AREA_TAB_BY_PATH, areaColor, areaIconFor } from "@/lib/area-catalog";
import { clearActiveArea } from "@/lib/active-area";

import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemePicker } from "@/components/ThemePicker";
import { ProfileDialog } from "@/components/ProfileDialog";
import { AdminContacts } from "@/components/AdminContacts";
import { Button } from "@/components/ui/button";
import { LogOut, UserCircle, ChevronRight, MessageSquare, QrCode, Shield, Palette } from "lucide-react";
import logoSogit from "@/assets/logo-sogit.jpg.asset.json";
import { format } from "date-fns";

export const Route = createFileRoute("/gestione/")({
  head: () => ({
    meta: [
      { title: "Gestione SOGIT · Area riservata" },
      { name: "description", content: "Area di accoglienza SOGIT Lignano: accedi alle macro aree abilitate, alle comunicazioni e ai questionari." },
      { property: "og:url", content: "https://your-domain.example/gestione/" },
      { property: "og:title", content: "Gestione SOGIT · Area riservata" },
      { property: "og:description", content: "Area di accoglienza SOGIT Lignano: accedi alle macro aree abilitate, alle comunicazioni e ai questionari." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Gestione SOGIT · Area riservata" },
      { name: "twitter:description", content: "Area di accoglienza SOGIT Lignano: accedi alle macro aree abilitate, alle comunicazioni e ai questionari." },
    ],
    links: [{ rel: "canonical", href: "https://your-domain.example/gestione/" }],
  }),
  component: GestionePage,
});

type Notif = { id: string; title: string; body: string | null; created_at: string; read_at: string | null; link: string | null };

function GestionePage() {
  const navigate = useNavigate();
  const fetchAreas = useServerFn(listMyAreas);
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    clearActiveArea();
    let cancelled = false;

    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const u = sess.session?.user;
      if (!u) { navigate({ to: "/auth", replace: true }); return; }
      const { data: prof } = await supabase
        .from("profiles" as any).select("username, must_change_password").eq("id", u.id).maybeSingle();
      if ((prof as any)?.must_change_password) { navigate({ to: "/auth", replace: true }); return; }
      if (cancelled) return;
      setUser(u);
      setUsername((prof as any)?.username ?? "");
      try {
        const res = await fetchAreas();
        if (!cancelled) { setAreas(res.areas); setIsAdmin(res.isAdmin || res.isDeveloper); setIsDeveloper(!!res.isDeveloper); }
      } catch { /* nessuna area */ }
      const { data: ns } = await supabase
        .from("notifications" as any).select("id, title, body, created_at, read_at, link")
        .eq("user_id", u.id).order("created_at", { ascending: false }).limit(8);
      if (!cancelled) { setNotifs(((ns as any) ?? []) as Notif[]); setReady(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="relative min-h-screen app-surface overflow-hidden">
      {/* Logo SOGIT sfumato sullo sfondo */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center"
      >
        <img
          src={logoSogit.url}
          alt=""
          className="w-[min(90vw,720px)] opacity-[0.06] blur-[1px] select-none"
        />
        <div className="absolute inset-0 bg-linear-to-b from-background/60 via-background/30 to-background/80" />
      </div>

      <div className="relative z-10">
        <header className="page-header">
          <div className="container mx-auto grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 sm:flex sm:py-4">
            <div className="brand-chip h-11 w-11 shrink-0 sm:h-12 sm:w-12">
              <img src={logoSogit.url} alt="Logo SOGIT" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0 sm:flex-1">
              <p className="eyebrow">Area riservata</p>
              <h1 className="font-display text-lg leading-tight tracking-tight truncate sm:text-2xl">Gestione S.O.G.IT.</h1>
            </div>
            <div className="col-span-2 flex items-center justify-end gap-2">
              {user && <NotificationsBell userId={user.id} isAdmin={isAdmin} />}
              <div className="flex items-center gap-1 rounded-full border bg-card/80 p-1 shadow-sm">
                <ThemePicker
                  trigger={
                    <button type="button" aria-label="Tema" title="Tema"
                      className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary">
                      <Palette className="h-4 w-4" />
                    </button>
                  }
                />
                <button type="button" onClick={() => setProfileOpen(true)} aria-label="Profilo" title="Profilo"
                  className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary">
                  <UserCircle className="h-4 w-4" />
                </button>
                <button type="button" onClick={logout} aria-label="Esci" title="Esci"
                  className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 space-y-7 sm:py-8 sm:space-y-8">
          <section className="space-y-1">
            <p className="eyebrow">Home</p>
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">Bentornato, {username || "operatore"}</h2>
            <p className="text-sm text-muted-foreground">
              Da qui accedi alle macro aree abilitate, alle comunicazioni e ai questionari.
            </p>
          </section>


          {isAdmin && (
            <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-medium text-admin hover:underline">
              <Shield className="h-4 w-4" /> Gestisci aree, utenti e permessi
            </Link>
          )}

          {/* Macro aree */}
          <section className="space-y-3">
            <p className="eyebrow">Le tue aree</p>
            {areas.length === 0 ? (
              <div className="editorial-card p-6">
                <h3 className="font-display text-lg">Nessuna area assegnata</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Al momento puoi consultare solo le comunicazioni e i questionari.
                  Le nuove aree compariranno qui non appena un amministratore ti abiliterà.
                </p>
              </div>
            ) : null}
            {(areas.length > 0 || isDeveloper) && (
              <div className="grid gap-4 md:grid-cols-2">
                {areas.map((a) => {
                  const c = areaColor(a.color);
                  const AreaIcon = areaIconFor(a.name, a.tabs);
                  return (
                    <Link
                      key={a.id}
                      to="/gestione/$areaId"
                      params={{ areaId: a.id }}
                      className={`editorial-card p-5 ring-1 ${c.ring} flex items-center justify-between gap-3 hover:ring-2 hover:ring-primary/40 transition`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${c.bg} ring-1 ${c.ring}`}>
                          <AreaIcon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <h3 className="font-display text-lg leading-tight tracking-tight">{a.name}</h3>
                          {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            {a.tabs.length} {a.tabs.length === 1 ? "scheda" : "schede"}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </Link>
                  );
                })}

                {isDeveloper && (
                  <Link
                    to="/security"
                    className="editorial-card p-5 ring-1 ring-admin/30 flex items-center justify-between gap-3 hover:ring-2 hover:ring-admin/50 transition"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-admin/10 ring-1 ring-admin/30">
                        <Shield className="h-5 w-5 text-admin" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-lg leading-tight tracking-tight">Sicurezza</h3>
                        <p className="text-xs text-muted-foreground">Sessioni attive, audit e controlli</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Solo programmatore</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </Link>
                )}
              </div>
            )}
          </section>

          {/* Sempre disponibili */}
          <section className="grid gap-4 md:grid-cols-2">
            <div className="editorial-card p-5">
              <p className="eyebrow flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Comunicazioni</p>
              {notifs.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {ready ? "Nessuna comunicazione ricevuta." : "Caricamento…"}
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {notifs.map((n) => (
                    <li key={n.id} className="rounded-lg border bg-card/70 px-3 py-2">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}
                        {!n.read_at && <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">nuova</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="editorial-card p-5 flex flex-col">
              <p className="eyebrow flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5" /> Questionari</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Consulta le risposte pubbliche dei questionari di gradimento e mostra il codice QR agli utenti.
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <Button asChild variant="outline"><Link to="/feedback">Questionari e risposte</Link></Button>
                <Button asChild><Link to="/qr"><QrCode className="mr-2 h-4 w-4" />Mostra codice QR</Link></Button>
              </div>
            </div>
          </section>

          <AdminContacts />
        </main>
      </div>

      {user && (
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} userId={user.id} />
      )}
    </div>
  );
}
