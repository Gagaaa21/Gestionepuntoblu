import { RouteVisibilityGate } from "@/components/RouteVisibilityGate";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackHome";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { ArrowLeft, BookMarked, Check, ChevronsUpDown, Pencil, Save, Upload, X } from "lucide-react";
import logoSogit from "@/assets/logo-sogit.jpg.asset.json";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

export const Route = createFileRoute("/procedures")({
  head: () => ({
    meta: [
      { title: "Procedure · Punto Blu" },
      { name: "description", content: "Procedure operative standard S.O.G.IT. consultabili rapidamente durante il servizio." },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app/procedures" },
      { property: "og:title", content: "Procedure · Punto Blu" },
      { property: "og:description", content: "Procedure operative standard S.O.G.IT. consultabili rapidamente durante il servizio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Procedure · Punto Blu" },
      { name: "twitter:description", content: "Procedure operative standard S.O.G.IT. consultabili rapidamente durante il servizio." },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app/procedures" }],
  }),
  component: ProceduresPage,
});

type IType = { id: string; name: string; parent_id: string | null };
type Procedure = { id: string; intervention_type_id: string; content: string; updated_at: string };

const MEDIA_PREFIX = "procedure-media:";

function SignedImage({ path, alt }: { path: string; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage.from("procedure-media").createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);
  if (!url) return <span className="inline-block h-32 w-full max-w-md bg-muted animate-pulse rounded" />;
  return <img src={url} alt={alt ?? ""} className="max-w-full h-auto rounded-md border my-2" />;
}

function SignedLink({ path, children }: { path: string; children: React.ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage.from("procedure-media").createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);
  if (!url) return <span className="text-muted-foreground">{children}</span>;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{children}</a>;
}

function ProcedureMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-img:rounded-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={(url) => url}
        components={{
          img: ({ src, alt }) => {
            const s = String(src ?? "");
            if (s.startsWith(MEDIA_PREFIX)) {
              return <SignedImage path={s.slice(MEDIA_PREFIX.length)} alt={alt} />;
            }
            return <img src={s} alt={alt ?? ""} className="max-w-full h-auto rounded-md border my-2" />;
          },
          a: ({ href, children }) => {
            const s = String(href ?? "");
            if (s.startsWith(MEDIA_PREFIX)) {
              return <SignedLink path={s.slice(MEDIA_PREFIX.length)}>{children}</SignedLink>;
            }
            return <a href={s} target="_blank" rel="noopener noreferrer" className="text-primary underline">{children}</a>;
          },
        }}
      >
        {content || "*Nessuna procedura disponibile per questo evento.*"}
      </ReactMarkdown>
    </div>
  );
}

function ProceduresPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [types, setTypes] = useState<IType[]>([]);
  const [procedures, setProcedures] = useState<Record<string, Procedure>>({});
  const [selectedId, setSelectedId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    const [{ data: tps }, { data: prs }] = await Promise.all([
      supabase.from("intervention_types" as any).select("id,name,parent_id").order("name"),
      supabase.from("procedures" as any).select("*"),
    ]);
    setTypes((tps as any) ?? []);
    const map: Record<string, Procedure> = {};
    ((prs as any) ?? []).forEach((p: Procedure) => { map[p.intervention_type_id] = p; });
    setProcedures(map);
  };

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const sUser = sess.session?.user;
      if (!sUser) { navigate({ to: "/auth", replace: true }); return; }
      const { data: roles } = await supabase.from("user_roles" as any).select("role").eq("user_id", sUser.id);
      setIsAdmin(!!((roles as any) ?? []).some((r: any) => r.role === "admin"));
      setReady(true);
      load();
    })();

    const ch = supabase
      .channel("procedures-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "procedures" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "intervention_types" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const selected = useMemo(() => types.find((t) => t.id === selectedId) ?? null, [types, selectedId]);
  const currentProc = selectedId ? procedures[selectedId] : null;

  const startEdit = () => {
    if (!selectedId) return;
    setDraft(currentProc?.content ?? "");
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraft(""); };

  const save = async () => {
    if (!selectedId) return;
    const { data: u } = await supabase.auth.getUser();
    const payload = { intervention_type_id: selectedId, content: draft, updated_by: u.user?.id };
    if (currentProc) {
      const { error } = await supabase.from("procedures" as any).update({ content: draft, updated_by: u.user?.id }).eq("id", currentProc.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("procedures" as any).insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Procedura salvata");
    setEditing(false);
    load();
  };

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) { setDraft((d) => d + text); return; }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = start + text.length; }, 0);
  };

  const handleUpload = async (file: File) => {
    if (!selectedId) return;
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${selectedId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("procedure-media").upload(path, file, { contentType: file.type, upsert: false });
    if (error) return toast.error(error.message);
    const isImg = file.type.startsWith("image/");
    const md = isImg
      ? `\n\n![${file.name}](${MEDIA_PREFIX}${path})\n\n`
      : `\n\n[${file.name}](${MEDIA_PREFIX}${path})\n\n`;
    insertAtCursor(md);
    toast.success("File caricato");
  };

  if (!ready) {
    return (
      <div className="min-h-screen app-surface grid place-items-center">
        <div className="text-sm text-muted-foreground">Caricamento…</div>
      </div>
    );
  }

  const sortIt = (a: IType, b: IType) => a.name.localeCompare(b.name, "it", { sensitivity: "base" });
  const hasContent = (id: string) => {
    const p = procedures[id];
    return !!(p && p.content && p.content.trim() !== "");
  };
  const visibleTypes = isAdmin ? types : types.filter((t) => {
    if (hasContent(t.id)) return true;
    // keep parents that have at least one child with content
    if (!t.parent_id) return types.some((c) => c.parent_id === t.id && hasContent(c.id));
    return false;
  });
  const parents = visibleTypes.filter((t) => !t.parent_id).sort(sortIt);
  const childrenOf = (pid: string) => visibleTypes.filter((t) => t.parent_id === pid).sort(sortIt);

  return (
    <div className="min-h-screen app-surface"><RouteVisibilityGate path="/procedures" />
      <PageHeader
        icon={<BookMarked className="h-5 w-5" />}
        eyebrow="Operatività"
        title="Procedure"
        subtitle="Istruzioni operative per ogni evento"
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Seleziona evento</CardTitle>
            <CardDescription>Scegli l'evento per consultare la procedura corrispondente.</CardDescription>
          </CardHeader>
          <CardContent>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" className="w-full sm:w-[400px] justify-between">
                  {selected ? selected.name : "Seleziona evento..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Cerca evento..." />
                  <CommandList onWheel={(e) => { e.currentTarget.scrollTop += e.deltaY; }}>
                    <CommandEmpty>Nessun evento trovato.</CommandEmpty>
                    {(() => {
                      const flatParents = parents.filter((p) => childrenOf(p.id).length === 0);
                      const groupedParents = parents.filter((p) => childrenOf(p.id).length > 0);
                      return (
                        <>
                          {flatParents.length > 0 && (
                            <CommandGroup>
                              {flatParents.map((t) => (
                                <CommandItem key={t.id} value={t.name} onSelect={() => { setSelectedId(t.id); setPickerOpen(false); setEditing(false); }}>
                                  <Check className={cn("mr-2 h-4 w-4", selectedId === t.id ? "opacity-100" : "opacity-0")} />
                                  {t.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                          {groupedParents.map((p) => (
                            <CommandGroup key={p.id} heading={p.name}>
                              {(isAdmin || hasContent(p.id)) && (
                                <CommandItem value={`${p.name} generico`} onSelect={() => { setSelectedId(p.id); setPickerOpen(false); setEditing(false); }}>
                                  <Check className={cn("mr-2 h-4 w-4", selectedId === p.id ? "opacity-100" : "opacity-0")} />
                                  <span className="text-muted-foreground">{p.name} (generico)</span>
                                </CommandItem>
                              )}
                              {childrenOf(p.id).map((c) => (
                                <CommandItem key={c.id} value={`${p.name} ${c.name}`} onSelect={() => { setSelectedId(c.id); setPickerOpen(false); setEditing(false); }}>
                                  <Check className={cn("mr-2 h-4 w-4", selectedId === c.id ? "opacity-100" : "opacity-0")} />
                                  {c.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ))}
                        </>
                      );
                    })()}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle>{selected.name}</CardTitle>
                {currentProc && (
                  <CardDescription>Ultimo aggiornamento: {new Date(currentProc.updated_at).toLocaleString("it-IT")}</CardDescription>
                )}
              </div>
              {isAdmin && !editing && (
                <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-4 w-4 mr-1" /> Modifica</Button>
              )}
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      accept="image/*,application/pdf"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-1" /> Carica immagine / PDF
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Supporta Markdown: **grassetto**, *corsivo*, # titoli, - elenchi.
                    </span>
                  </div>
                  <Textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={16}
                    className="font-mono text-sm"
                    placeholder="Scrivi qui le istruzioni operative…"
                  />
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Anteprima</Label>
                    <div className="border rounded-md p-4 bg-card">
                      <ProcedureMarkdown content={draft} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={cancelEdit}><X className="h-4 w-4 mr-1" /> Annulla</Button>
                    <Button onClick={save}><Save className="h-4 w-4 mr-1" /> Salva</Button>
                  </div>
                </div>
              ) : (
                <ProcedureMarkdown content={currentProc?.content ?? ""} />
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
