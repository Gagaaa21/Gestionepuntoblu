import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { RouteVisibilityGate } from "@/components/RouteVisibilityGate";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Save, Download, Copy, QrCode, ListChecks, BarChart3, Star, Loader2, ExternalLink, Settings2, ShieldCheck, Sparkles, ThumbsUp, ThumbsDown, Minus } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeSurveyThemes } from "@/lib/api/survey-ai.functions";


export const Route = createFileRoute("/questionario")({
  head: () => ({
    meta: [
      { title: "Questionari · Archivio clinico Punto Blu" },
      { name: "description", content: "Gestione dei questionari di gradimento: domande, questionari attivi e raccolta risposte." },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app/questionario" },
      { property: "og:title", content: "Questionari · Archivio clinico Punto Blu" },
      { property: "og:description", content: "Gestione dei questionari di gradimento: domande, questionari attivi e raccolta risposte." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Questionari · Archivio clinico Punto Blu" },
      { name: "twitter:description", content: "Gestione dei questionari di gradimento: domande, questionari attivi e raccolta risposte." },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app/questionario" }],
  }),
  component: QuestionarioPage,
});

type Kind = "rating" | "single" | "multi" | "text" | "yesno";
type Survey = {
  id: string; slug: string; name: string; subject: string | null; description: string | null;
  active: boolean; public_results: boolean;
  privacy_text: string | null; privacy_required: boolean;
};
type Question = {
  id: string; survey_id: string; position: number; kind: Kind;
  label: string; options: string[] | null; required: boolean; active: boolean;
};
type Response = {
  id: string; survey_id: string; respondent_name: string | null; privacy_consent: boolean;
  answers: { question_id: string; label: string; kind: Kind; value: any }[];
  created_at: string;
};

const KIND_LABEL: Record<Kind, string> = {
  rating: "Valutazione a stelle (1–5)",
  yesno: "Sì / No",
  single: "Scelta singola",
  multi: "Scelta multipla",
  text: "Testo libero",
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "questionario";
}

function QuestionarioPage() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/auth" }); return; }
      const { data: roles } = await supabase.from("user_roles" as any).select("role").eq("user_id", data.user.id);
      const admin = ((roles as any) ?? []).some((r: any) => r.role === "admin" || r.role === "developer");
      setIsAdmin(admin);
      if (!admin) { toast.error("Sezione riservata"); navigate({ to: "/dashboard" }); }
    })();
  }, []);

  const loadSurveys = async () => {
    const { data, error } = await supabase.from("surveys" as any).select("*").order("created_at", { ascending: true });
    if (error) { toast.error(error.message); return; }
    const list = ((data as any) ?? []) as Survey[];
    setSurveys(list);
    if (!selectedId && list.length > 0) setSelectedId(list[0].id);
  };

  useEffect(() => { if (isAdmin) loadSurveys(); }, [isAdmin]);

  if (!isAdmin) return null;
  const selected = surveys.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="min-h-screen">
      <RouteVisibilityGate path="/questionario" />
      <PageHeader
        icon={<ListChecks className="h-5 w-5" />}
        eyebrow="Feedback"
        title="Questionari"
        subtitle="Crea sondaggi, QR e leggi le risposte"
      />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <SurveysBar surveys={surveys} selectedId={selectedId} onSelect={setSelectedId} onChange={loadSurveys} />
        {selected ? (
          <SurveyPanels survey={selected} onChange={loadSurveys} />
        ) : (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nessun questionario. Creane uno per iniziare.
          </CardContent></Card>
        )}
      </main>
    </div>
  );
}

/* ------------------------- SURVEYS LIST + CREATE -------------------------- */

function SurveysBar({ surveys, selectedId, onSelect, onChange }: {
  surveys: Survey[]; selectedId: string | null;
  onSelect: (id: string) => void; onChange: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (creating) setSlug(slugify(name)); }, [name, creating]);

  async function create() {
    if (!name.trim()) { toast.error("Nome obbligatorio"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("surveys" as any).insert({
      name: name.trim(), subject: subject.trim() || null, description: description.trim() || null,
      slug: slugify(slug || name), active: true, public_results: true,
    } as any).select().single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Questionario creato");
    setCreating(false); setName(""); setSubject(""); setDescription(""); setSlug("");
    onChange();
    if (data) onSelect((data as any).id);
  }

  return (
    <Card>
      <CardContent className="pt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Label className="text-xs shrink-0">Questionario</Label>
          <Select value={selectedId ?? undefined} onValueChange={onSelect}>
            <SelectTrigger className="w-full max-w-md"><SelectValue placeholder="Seleziona…" /></SelectTrigger>
            <SelectContent>
              {surveys.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} {s.active ? "" : "· (disattivato)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1.5" />Nuovo questionario</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuovo questionario</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Questionario Punto Blu" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Oggetto valutato</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="es. Servizio ambulatoriale Punto Blu" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Descrizione</Label>
                <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrizione mostrata prima delle domande." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Indirizzo del QR (slug)</Label>
                <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
                <p className="text-[11px] text-muted-foreground">Il QR punterà a <code>/feedback/{slug || "…"}</code></p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreating(false)}>Annulla</Button>
              <Button onClick={create} disabled={saving}>{saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Salvo…</> : "Crea"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/* ---------------------------- PANELS PER SURVEY --------------------------- */

function SurveyPanels({ survey, onChange }: { survey: Survey; onChange: () => void }) {
  return (
    <>
      <SurveyMetaEditor survey={survey} onChange={onChange} />
      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions"><ListChecks className="h-4 w-4 mr-1.5" />Domande</TabsTrigger>
          <TabsTrigger value="qr"><QrCode className="h-4 w-4 mr-1.5" />QR code</TabsTrigger>
          <TabsTrigger value="results"><BarChart3 className="h-4 w-4 mr-1.5" />Risultati</TabsTrigger>
        </TabsList>
        <TabsContent value="questions"><QuestionsEditor surveyId={survey.id} /></TabsContent>
        <TabsContent value="qr"><QrPanel survey={survey} /></TabsContent>
        <TabsContent value="results"><ResultsPanel surveyId={survey.id} /></TabsContent>
      </Tabs>
    </>
  );
}

function SurveyMetaEditor({ survey, onChange }: { survey: Survey; onChange: () => void }) {
  const [q, setQ] = useState<Survey>(survey);
  useEffect(() => setQ(survey), [survey.id]);
  const dirty = JSON.stringify(q) !== JSON.stringify(survey);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("surveys" as any).update({
      name: q.name, subject: q.subject, description: q.description, slug: slugify(q.slug),
      active: q.active, public_results: q.public_results,
      privacy_text: q.privacy_text, privacy_required: q.privacy_required,
    } as any).eq("id", q.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Salvato"); onChange();
  }

  async function remove() {
    if (!confirm(`Eliminare "${survey.name}" e TUTTE le sue domande e risposte? L'azione è irreversibile.`)) return;
    const { error } = await supabase.from("surveys" as any).delete().eq("id", survey.id);
    if (error) return toast.error(error.message);
    toast.success("Eliminato"); onChange();
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Settings2 className="h-4 w-4" />Impostazioni questionario</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Nome</Label>
          <Input value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Oggetto valutato</Label>
          <Input value={q.subject ?? ""} onChange={(e) => setQ({ ...q, subject: e.target.value })} placeholder="Cosa viene valutato…" />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-xs">Descrizione</Label>
          <Textarea rows={2} value={q.description ?? ""} onChange={(e) => setQ({ ...q, description: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Slug (indirizzo del QR)</Label>
          <Input value={q.slug} onChange={(e) => setQ({ ...q, slug: e.target.value })} />
        </div>
        <div className="flex items-center gap-4 md:justify-end">
          <label className="flex items-center gap-2 text-sm"><Switch checked={q.active} onCheckedChange={(v) => setQ({ ...q, active: v })} />Attivo</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={q.public_results} onCheckedChange={(v) => setQ({ ...q, public_results: v })} />Risultati pubblici</label>
        </div>

        <div className="md:col-span-2 rounded-md border border-primary/20 bg-primary/[0.03] p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Informativa privacy
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={q.privacy_required} onCheckedChange={(v) => setQ({ ...q, privacy_required: v })} />
              Consenso obbligatorio
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Testo mostrato sopra la spunta di consenso. Se il consenso è obbligatorio, senza accettazione il modulo non può essere inviato.
          </p>
          <Textarea
            rows={4}
            value={q.privacy_text ?? ""}
            onChange={(e) => setQ({ ...q, privacy_text: e.target.value })}
            placeholder="Es. I dati raccolti sono trattati ai sensi del Reg. UE 2016/679…"
          />
        </div>

        <div className="md:col-span-2 flex justify-between">
          <Button variant="ghost" className="text-destructive" onClick={remove}><Trash2 className="h-4 w-4 mr-1.5" />Elimina</Button>
          <Button disabled={!dirty || saving} onClick={save}><Save className="h-4 w-4 mr-1.5" />Salva</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------- QUESTIONS ------------------------------- */

function QuestionsEditor({ surveyId }: { surveyId: string }) {
  const [items, setItems] = useState<Question[] | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from("survey_questions" as any).select("*").eq("survey_id", surveyId).order("position", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setItems((data as any) ?? []);
  };
  useEffect(() => { setItems(null); load(); }, [surveyId]);

  async function addQuestion() {
    const next = (items?.length ?? 0);
    const { error } = await supabase.from("survey_questions" as any).insert({
      survey_id: surveyId, position: next, kind: "rating", label: "Nuova domanda", required: false, active: true, options: null,
    } as any);
    if (error) toast.error(error.message); else load();
  }
  async function save(q: Question) {
    const { error } = await supabase.from("survey_questions" as any).update({
      label: q.label, kind: q.kind, options: q.options, required: q.required, active: q.active, position: q.position,
    } as any).eq("id", q.id);
    if (error) toast.error(error.message); else { toast.success("Salvata"); load(); }
  }
  async function remove(id: string) {
    if (!confirm("Eliminare questa domanda?")) return;
    const { error } = await supabase.from("survey_questions" as any).delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  }
  async function move(idx: number, dir: -1 | 1) {
    if (!items) return;
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const a = items[idx], b = items[j];
    await supabase.from("survey_questions" as any).update({ position: b.position } as any).eq("id", a.id);
    await supabase.from("survey_questions" as any).update({ position: a.position } as any).eq("id", b.id);
    load();
  }

  if (!items) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4 mt-4">
      {items.length === 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nessuna domanda. Aggiungine una qui sotto per iniziare.</CardContent></Card>
      )}
      {items.map((q, i) => (
        <QuestionRow key={q.id} q={q} first={i === 0} last={i === items.length - 1} onMove={(d) => move(i, d)} onSave={save} onRemove={() => remove(q.id)} />
      ))}
      <Button onClick={addQuestion} variant="outline" className="w-full"><Plus className="h-4 w-4 mr-2" />Aggiungi domanda</Button>
    </div>
  );
}

function QuestionRow({ q: initial, first, last, onMove, onSave, onRemove }: {
  q: Question; first: boolean; last: boolean;
  onMove: (d: -1 | 1) => void; onSave: (q: Question) => void; onRemove: () => void;
}) {
  const [q, setQ] = useState<Question>(initial);
  // Buffer testuale grezzo: così l'utente può andare a capo, inserire spazi
  // e digitare senza che ogni tasto rimuova le righe vuote in corso di scrittura.
  const [optionsText, setOptionsText] = useState<string>((initial.options ?? []).join("\n"));
  useEffect(() => {
    setQ(initial);
    setOptionsText((initial.options ?? []).join("\n"));
  }, [initial.id, initial.position]);
  const needsOptions = q.kind === "single" || q.kind === "multi";
  const parsedOptions = optionsText.split("\n").map((s) => s.trim()).filter(Boolean);
  const dirty =
    JSON.stringify({ ...q, options: needsOptions ? parsedOptions : null }) !==
    JSON.stringify({ ...initial, options: initial.options ?? null });

  function handleSave() {
    onSave({ ...q, options: needsOptions ? parsedOptions : null });
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex flex-col gap-1">
            <Button size="icon" variant="ghost" disabled={first} onClick={() => onMove(-1)} className="h-7 w-7"><ArrowUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" disabled={last} onClick={() => onMove(1)} className="h-7 w-7"><ArrowDown className="h-4 w-4" /></Button>
          </div>
          <div className="flex-1 space-y-2">
            <Input value={q.label} onChange={(e) => setQ({ ...q, label: e.target.value })} placeholder="Testo della domanda" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
              <Select value={q.kind} onValueChange={(v) => setQ({ ...q, kind: v as Kind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm"><Switch checked={q.required} onCheckedChange={(v) => setQ({ ...q, required: v })} />Obbligatoria</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={q.active} onCheckedChange={(v) => setQ({ ...q, active: v })} />Attiva</label>
            </div>
            {needsOptions && (
              <div className="space-y-1.5">
                <Label className="text-xs">Opzioni di risposta · una per riga</Label>
                <Textarea
                  rows={5}
                  placeholder={"Opzione 1\nOpzione 2\nOpzione 3"}
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  {parsedOptions.length === 0
                    ? "Aggiungi almeno 2 opzioni. Vai a capo per separare le voci."
                    : `${parsedOptions.length} ${parsedOptions.length === 1 ? "opzione pronta" : "opzioni pronte"}: ${parsedOptions.slice(0, 3).join(" · ")}${parsedOptions.length > 3 ? " · …" : ""}`}
                </p>
              </div>
            )}
          </div>
          <Button size="icon" variant="ghost" onClick={onRemove} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={!dirty || (needsOptions && parsedOptions.length < 2)} onClick={handleSave}><Save className="h-4 w-4 mr-1.5" />Salva</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------- QR ----------------------------------- */

function QrPanel({ survey }: { survey: Survey }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState("");

  // QR UNICO: punta sempre alla landing con l'elenco di tutti i servizi da valutare.
  // L'utente scansiona un solo codice, sceglie il servizio, poi compila.
  const landingUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/feedback`;
  }, []);
  const directUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/feedback/${survey.slug}`;
  }, [survey.slug]);

  useEffect(() => {
    if (!landingUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, landingUrl, { width: 320, margin: 2, color: { dark: "#0f1b3d", light: "#ffffff" } });
    QRCode.toDataURL(landingUrl, { width: 1024, margin: 2, color: { dark: "#0f1b3d", light: "#ffffff" } }).then(setDataUrl);
  }, [landingUrl]);

  function copyLanding() { navigator.clipboard.writeText(landingUrl); toast.success("Link copiato"); }
  function copyDirect() { navigator.clipboard.writeText(directUrl); toast.success("Link diretto copiato"); }
  function download() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl; a.download = `qr-sogit-feedback.png`; a.click();
  }

  return (
    <div className="mt-4 max-w-md mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">QR universale · unico per tutti i questionari</CardTitle>
          <CardDescription>
            Questo QR è lo stesso per ogni servizio. Chi lo scansiona vede la pagina con l'elenco dei questionari attivi e sceglie quale compilare.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <div className="p-4 bg-white rounded-lg border shadow-sm"><canvas ref={canvasRef} /></div>
          <Button onClick={download} className="w-full"><Download className="h-4 w-4 mr-2" />Scarica QR universale (PNG)</Button>
          <div className="w-full space-y-2 pt-2 border-t">
            <Label className="text-xs">Indirizzo del QR</Label>
            <Input readOnly value={landingUrl} onFocus={(e) => e.currentTarget.select()} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={copyLanding} className="flex-1"><Copy className="h-4 w-4 mr-2" />Copia link</Button>
              <a href={landingUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="outline" className="w-full"><ExternalLink className="h-4 w-4 mr-2" />Apri</Button>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Link diretto a "{survey.name}"</CardTitle>
          <CardDescription className="text-xs">Se vuoi condividere solo questo questionario senza passare dalla landing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input readOnly value={directUrl} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
          <Button variant="ghost" size="sm" onClick={copyDirect} className="w-full"><Copy className="h-4 w-4 mr-2" />Copia link diretto</Button>
        </CardContent>
      </Card>
    </div>
  );
}



/* -------------------------------- RESULTS -------------------------------- */

function ResultsPanel({ surveyId }: { surveyId: string }) {
  const [rows, setRows] = useState<Response[] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  const load = async () => {
    const [r1, r2] = await Promise.all([
      supabase.from("survey_responses" as any).select("*").eq("survey_id", surveyId).order("created_at", { ascending: false }),
      supabase.from("survey_questions" as any).select("*").eq("survey_id", surveyId).order("position", { ascending: true }),
    ]);
    if (r1.error) toast.error(r1.error.message);
    setRows(((r1.data as any) ?? []) as Response[]);
    setQuestions(((r2.data as any) ?? []) as Question[]);
  };
  useEffect(() => { setRows(null); load(); }, [surveyId]);

  const aggregates = useMemo(() => {
    if (!rows) return [];
    return questions.map((q) => {
      const values = rows.map((r) => (r.answers ?? []).find((a) => a.question_id === q.id)?.value).filter((v) => v !== null && v !== undefined && v !== "");
      return { q, values };
    });
  }, [rows, questions]);

  async function del(id: string) {
    if (!confirm("Eliminare questa risposta?")) return;
    const { error } = await supabase.from("survey_responses" as any).delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  }

  if (!rows) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="mt-4 space-y-6">
      <AiThemesCard surveyId={surveyId} responseCount={rows.length} />

      <Card>
        <CardHeader><CardTitle className="text-base">Riepilogo · {rows.length} risposte</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {aggregates.length === 0 && <p className="text-sm text-muted-foreground">Nessuna domanda configurata.</p>}
          {aggregates.map(({ q, values }) => (
            <div key={q.id} className="pb-4 border-b last:border-b-0 last:pb-0">
              <div className="text-sm font-medium mb-2">{q.label} <span className="text-muted-foreground font-normal">· {values.length} risposte</span></div>
              <Aggregation q={q} values={values} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Risposte singole</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Ancora nessuna risposta.</p>}
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{r.privacy_consent && r.respondent_name ? r.respondent_name : "Anonimo"}</span>
                  <span className="text-muted-foreground"> · {new Date(r.created_at).toLocaleString("it-IT")}</span>
                  {r.privacy_consent && <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">Privacy accettata</span>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => del(r.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="text-sm space-y-1">
                {(r.answers ?? []).filter((a: any) => a && a.question_id).map((a, i) => (
                  <div key={i}><span className="text-muted-foreground">{a.label}:</span> <AnswerValue kind={a.kind} value={a.value} /></div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AnswerValue({ kind, value }: { kind: Kind; value: any }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground italic">—</span>;
  if (kind === "rating") return <span className="inline-flex items-center gap-0.5">{Array.from({ length: Number(value) || 0 }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />)}</span>;
  if (kind === "yesno") return <span>{value === "yes" ? "Sì" : "No"}</span>;
  if (kind === "multi") return <span>{(Array.isArray(value) ? value : []).join(", ")}</span>;
  return <span>{String(value)}</span>;
}

function Aggregation({ q, values }: { q: Question; values: any[] }) {
  if (values.length === 0) return <div className="text-xs text-muted-foreground">Nessuna risposta</div>;
  if (q.kind === "rating") {
    const nums = values.map(Number).filter((n) => n >= 1 && n <= 5);
    const avg = nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length);
    const dist = [1, 2, 3, 4, 5].map((n) => ({ n, c: nums.filter((x) => x === n).length }));
    return (
      <div className="space-y-1.5">
        <div className="text-sm">Media: <span className="font-semibold">{avg.toFixed(2)}</span> / 5</div>
        {dist.map((d) => <Bar key={d.n} label={`${d.n}★`} count={d.c} total={nums.length} />)}
      </div>
    );
  }
  if (q.kind === "yesno") {
    const yes = values.filter((v) => v === "yes").length;
    const no = values.filter((v) => v === "no").length;
    return <div className="space-y-1.5"><Bar label="Sì" count={yes} total={values.length} /><Bar label="No" count={no} total={values.length} /></div>;
  }
  if (q.kind === "single" || q.kind === "multi") {
    const flat = q.kind === "multi" ? values.flatMap((v) => Array.isArray(v) ? v : []) : values;
    const opts = q.options ?? Array.from(new Set(flat.map(String)));
    const denom = q.kind === "multi" ? values.length : flat.length;
    return (
      <div className="space-y-1.5">
        {opts.map((o) => <Bar key={o} label={o} count={flat.filter((x) => x === o).length} total={denom} />)}
      </div>
    );
  }
  return (
    <ul className="space-y-1 pl-4 list-disc text-sm">
      {values.map((v, i) => <li key={i} className="text-foreground/90">{String(v)}</li>)}
    </ul>
  );
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-16 shrink-0 text-muted-foreground">{label}</div>
      <div className="flex-1 h-2 bg-muted rounded overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
      <div className="w-16 shrink-0 text-right tabular-nums">{count} · {pct}%</div>
    </div>
  );
}

/* ------------------------------ AI Themes ------------------------------ */

type Theme = { title: string; sentiment: "positive" | "negative" | "neutral"; count: number; quote: string | null };

function AiThemesCard({ surveyId, responseCount }: { surveyId: string; responseCount: number }) {
  const analyze = useServerFn(analyzeSurveyThemes);
  const [loading, setLoading] = useState(false);
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [analyzed, setAnalyzed] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res: any = await analyze({ data: { surveyId } });
      setThemes(res.themes ?? []);
      setAnalyzed(res.commentsAnalyzed ?? 0);
    } catch (e: any) {
      setError(e?.message ?? "Errore imprevisto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/20 bg-linear-to-br from-primary/[0.03] to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Temi ricorrenti (AI)</CardTitle>
            <CardDescription className="text-xs mt-1">Analisi automatica dei commenti liberi per individuare cosa piace, cosa non piace e i temi ripetuti.</CardDescription>
          </div>
          <Button size="sm" variant={themes ? "outline" : "default"} onClick={run} disabled={loading || responseCount === 0}>
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            {themes ? "Rianalizza" : "Analizza"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!themes && !error && (
          <p className="text-xs text-muted-foreground">
            {responseCount === 0 ? "Servono almeno alcune risposte con commento libero." : "Premi \"Analizza\" per estrarre i temi dai commenti."}
          </p>
        )}
        {themes && themes.length === 0 && !error && (
          <p className="text-xs text-muted-foreground">Nessun tema significativo rilevato ({analyzed} commenti analizzati).</p>
        )}
        {themes && themes.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{analyzed} commenti analizzati</div>
            {themes.map((t, i) => {
              const tone = t.sentiment === "positive" ? "text-emerald-700 bg-emerald-50 ring-emerald-200" : t.sentiment === "negative" ? "text-destructive bg-destructive/5 ring-destructive/20" : "text-foreground bg-muted ring-border";
              const Icon = t.sentiment === "positive" ? ThumbsUp : t.sentiment === "negative" ? ThumbsDown : Minus;
              return (
                <div key={i} className="rounded-lg border p-3 space-y-1.5 bg-card">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${tone}`}>
                      <Icon className="h-3 w-3" />{t.sentiment === "positive" ? "Positivo" : t.sentiment === "negative" ? "Critico" : "Neutro"}
                    </span>
                    <div className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">{t.title}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums shrink-0">×{t.count}</div>
                  </div>
                  {t.quote && <p className="text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-2">"{t.quote}"</p>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
