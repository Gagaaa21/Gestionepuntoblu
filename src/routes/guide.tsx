import { RouteVisibilityGate } from "@/components/RouteVisibilityGate";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackHome";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ArrowLeft, BookOpen, Save, Pencil, PlusCircle, Search, FileDown, ListChecks,
  Users, Bell, Shield, Phone, Palette, LifeBuoy, X,
} from "lucide-react";
import { renderGuide } from "@/lib/render-guide";
import { AdminContacts } from "@/components/AdminContacts";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "Guida · Archivio clinico Punto Blu" },
      { name: "description", content: "Guida all'uso del gestionale S.O.G.IT.: funzioni principali, procedure e consigli pratici." },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app/guide" },
      { property: "og:title", content: "Guida · Archivio clinico Punto Blu" },
      { property: "og:description", content: "Guida all'uso del gestionale S.O.G.IT.: funzioni principali, procedure e consigli pratici." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Guida · Archivio clinico Punto Blu" },
      { name: "twitter:description", content: "Guida all'uso del gestionale S.O.G.IT.: funzioni principali, procedure e consigli pratici." },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app/guide" }],
  }),
  component: GuidePage,
});

const DEFAULT_GUIDE = `# Benvenuto in Archivio clinico Punto Blu

Questa guida ti accompagna nell'uso quotidiano dell'applicazione.

## Le tue prime azioni
- **Registra un intervento** dalla dashboard: compila nome, cognome, evento e parametri vitali.
- Se conosci solo il nome **o** solo il cognome, l'intervento viene comunque salvato ma **non** viene creata una cartella clinica dedicata.
- Con nome e cognome completi (non solo iniziali), il sistema crea automaticamente la cartella clinica e vi collega l'intervento.

## Consigli utili
- Puoi aggiungere più eventi contemporaneamente allo stesso intervento con il tasto **+**.
- I parametri vitali possono essere registrati a più tempi (T1, T2, T3…): usa il timeline editor.
- Se sei offline, l'intervento viene messo in coda e inviato automaticamente al rientro della connessione.

## Cerca e consulta
- Nella sezione **Cerca** puoi trovare pazienti e interventi passati con filtri avanzati.
- Cliccando su un intervento (anche non tuo) puoi visualizzarlo in sola lettura.
- Gli **admin** possono modificare qualsiasi intervento; gli utenti solo quelli a proprio nome.

## Sicurezza
- Cambia la password se sospetti che qualcuno la conosca (menu profilo).
- Il logout automatico avviene ogni giorno alle 00:01 e alle 14:10.
- 5 tentativi falliti bloccano l'accesso per 15 minuti — contatta un admin per sbloccarti.

## Personalizzazione
- Il tasto **Tema** ti permette di scegliere modalità chiara/scura, colore d'accento, stile degli angoli, densità dell'interfaccia e famiglia del carattere.
- Le tue preferenze sono ricordate su questo dispositivo.

## Notifiche e comunicazioni
- La campanella mostra le comunicazioni degli admin.
- Le comunicazioni importanti compaiono come avviso bloccante finché non confermi la presa visione.
`;

const QUICK_TILES = [
  { icon: PlusCircle, title: "Registra un intervento", body: "Compila nome, cognome, evento e parametri. La cartella clinica si crea automaticamente se il nominativo è completo." },
  { icon: Search, title: "Cerca uno storico", body: "Trova pazienti e interventi con filtri per data, operatore o evento. Clicca una riga per aprirla in sola lettura." },
  { icon: FileDown, title: "Genera il resoconto", body: "La sezione Resoconto produce il report giornaliero in PDF con tutti gli interventi del turno." },
  { icon: ListChecks, title: "Check list zaino", body: "Usa la check list quotidiana per verificare la dotazione dello zaino prima del turno." },
  { icon: Bell, title: "Notifiche & comunicazioni", body: "La campanella mostra le comunicazioni degli admin. Gli avvisi bloccanti vanno confermati con \"Ho preso visione\"." },
  { icon: Palette, title: "Tema personalizzato", body: "Colore, angoli, densità e carattere: personalizza l'interfaccia dal tasto Tema. Preferenze salvate localmente." },
  { icon: Users, title: "Ruoli professionali", body: "Accanto al nome dell'operatore compare l'icona della qualifica: 🚑 soccorritore, 🩺 infermiere, ✚ medico." },
  { icon: Shield, title: "Sicurezza & login", body: "Cambio password richiesto al primo accesso. 5 tentativi errati = blocco 15 min. Logout automatico alle 00:01 e 14:10." },
];

function GuidePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const load = async () => {
    const { data } = await supabase.from("app_settings" as any).select("value").eq("key", "user_guide").maybeSingle();
    setContent((data as any)?.value ?? "");
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/auth" }); return; }
      const { data: roles } = await supabase.from("user_roles" as any).select("role").eq("user_id", data.user.id);
      setIsAdmin(!!(roles as any)?.some((r: any) => r.role === "admin"));
      await load();
      setReady(true);
    })();

    const ch = supabase.channel("guide-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (!ready) return null;

  const displayed = content?.trim() ? content : DEFAULT_GUIDE;

  const startEdit = () => { setDraft(displayed); setEditing(true); };
  const save = async () => {
    const { error } = await supabase.from("app_settings" as any)
      .upsert({ key: "user_guide", value: draft, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success("Guida aggiornata");
    setContent(draft);
    setEditing(false);
  };
  const resetToDefault = () => setDraft(DEFAULT_GUIDE);

  return (
    <div className="min-h-screen app-surface">
      <RouteVisibilityGate path="/guide" />
      <PageHeader
        icon={<BookOpen className="h-5 w-5" />}
        eyebrow="Supporto"
        title="Guida al funzionamento"
        subtitle="Tutto quello che ti serve per iniziare in pochi minuti."
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-2xl border p-6 sm:p-8"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--primary) 12%, var(--card)), var(--card))",
          }}
        >
          <div className="max-w-2xl space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              <LifeBuoy className="h-3.5 w-3.5" /> Manuale rapido
            </span>
            <h2 className="font-display text-2xl sm:text-3xl leading-tight tracking-tight">
              Come usare Archivio clinico Punto Blu
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Una guida sintetica ai flussi principali: registra interventi, consulta lo storico, gestisci le
              comunicazioni e personalizza l'interfaccia. Se qualcosa non è chiaro, contatta un amministratore
              in fondo alla pagina.
            </p>
          </div>
          <div className="pointer-events-none absolute -right-10 -bottom-10 h-40 w-40 rounded-full blur-3xl opacity-40"
               style={{ background: "var(--primary)" }} />
        </section>

        {/* Quick tiles */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_TILES.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.title} className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg"
                       style={{ background: "color-mix(in oklab, var(--primary) 12%, transparent)", color: "var(--primary)" }}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{t.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{t.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Manuale esteso */}
        <Card className="section-card">
          <CardHeader className="section-header flex flex-row items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><BookOpen className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Manuale esteso</CardTitle>
                <CardDescription>Istruzioni dettagliate sull'uso dell'archivio clinico.</CardDescription>
              </div>
            </div>
            {isAdmin && !editing && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="h-4 w-4 mr-1" /> Modifica
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-3">
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={22} className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">
                  Markdown supportato: <code># Titolo</code>, <code>## Sottotitolo</code>, <code>**grassetto**</code>, <code>- elenco</code>.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={save}><Save className="h-4 w-4 mr-1" /> Salva</Button>
                  <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" /> Annulla</Button>
                  <Button variant="ghost" onClick={resetToDefault}>Ripristina testo predefinito</Button>
                </div>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none prose-headings:font-display prose-headings:tracking-tight prose-h1:text-2xl prose-h2:text-lg prose-h2:mt-6 prose-h3:text-base prose-p:leading-relaxed">
                {renderGuide(displayed)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contatti admin */}
        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><Phone className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Serve aiuto?</CardTitle>
                <CardDescription>Contatta uno degli amministratori qui sotto.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <AdminContacts />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
