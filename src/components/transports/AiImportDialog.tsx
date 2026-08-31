/**
 * Import assistito (PDF o testo) con ANTEPRIMA MODIFICABILE.
 * Nulla viene salvato finché non si confermano le righe selezionate.
 */
import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Sparkles, Trash2, AlertTriangle } from "lucide-react";
import type { Kind } from "./shared";

export type ParsedRow = {
  kind: Kind;
  date: string;
  first_name?: string | null;
  last_name?: string | null;
  first_name_2?: string | null;
  last_name_2?: string | null;
  departure?: string | null;
  arrival?: string | null;
  kilometers?: number | null;
  price?: number | null;
  sosta_hours?: number | null;
  sosta_price?: number | null;
  is_round_trip?: boolean;
  annullato?: boolean;
  nurse_hours?: number | null;
  nurse_hourly?: number | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  notes?: string | null;
};

type Draft = ParsedRow & { _id: number; _keep: boolean; _dup: boolean };

const kindLabel: Record<Kind, string> = { intra: "Ospedaliero", other: "ADI / altro", nurse: "Infermiere" };

export function AiImportDialog({
  open, onOpenChange, defaultKind, parse, isDuplicate, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultKind: Kind;
  parse: (input: { text?: string; pdf?: { name: string; b64: string; mime: string } }) => Promise<ParsedRow[]>;
  isDuplicate: (r: ParsedRow) => boolean;
  onConfirm: (rows: ParsedRow[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [pdf, setPdf] = useState<{ name: string; b64: string; mime: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const idRef = useRef(0);

  const reset = () => { setText(""); setPdf(null); setDrafts(null); };

  const pickPdf = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) return toast.error("PDF troppo grande (max 20 MB)");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    setPdf({ name: file.name, b64: btoa(bin), mime: file.type || "application/pdf" });
  };

  const runParse = async () => {
    if (!text.trim() && !pdf) return toast.error("Incolla del testo o carica un PDF");
    setBusy(true);
    try {
      const rows = await parse({ text: text.trim() || undefined, pdf: pdf ?? undefined });
      if (!rows.length) { toast.error("Nessuna riga riconosciuta nel documento"); return; }
      const seen = new Set<string>();
      const list: Draft[] = rows.map((r) => {
        const sig = [r.kind, r.date, r.last_name, r.first_name, r.last_name_2, r.departure, r.arrival, r.price].join("|").toLowerCase();
        const dup = isDuplicate(r) || seen.has(sig);
        seen.add(sig);
        return { ...r, kind: r.kind || defaultKind, _id: ++idRef.current, _keep: !dup, _dup: dup };
      });
      setDrafts(list);
      const dups = list.filter((d) => d._dup).length;
      toast.success(`${list.length} righe riconosciute${dups ? ` · ${dups} possibili duplicati già deselezionati` : ""}`);
    } catch (e: any) {
      toast.error(e?.message || "Errore durante la lettura");
    } finally { setBusy(false); }
  };

  const patch = (id: number, p: Partial<Draft>) =>
    setDrafts((d) => (d ? d.map((r) => (r._id === id ? { ...r, ...p } : r)) : d));

  const selected = useMemo(() => (drafts ?? []).filter((d) => d._keep), [drafts]);

  const confirm = async () => {
    if (!selected.length) return toast.error("Nessuna riga selezionata");
    const missingSurname = selected.find((row) => !row.last_name?.trim());
    if (missingSurname) return toast.error("Inserisci il cognome in tutte le righe selezionate");
    const missingSecondSurname = selected.find((row) => row.first_name_2?.trim() && !row.last_name_2?.trim());
    if (missingSecondSurname) return toast.error("Inserisci il cognome del secondo paziente");
    const missingKilometers = selected.find((row) => row.kind !== "nurse" && !row.annullato && (row.kilometers == null || row.kilometers <= 0));
    if (missingKilometers) return toast.error("Inserisci i km in tutti i viaggi non annullati");
    setBusy(true);
    try {
      await onConfirm(selected.map(({ _id, _keep, _dup, ...r }) => r));
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Errore durante l'importazione");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Import assistito · anteprima prima di salvare</DialogTitle>
        </DialogHeader>

        {!drafts ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Carica il PDF mensile (sezioni <b>OSPEDALIERI</b>, <b>ADI</b>, <b>CON INFERMIERE</b>) oppure incolla righe da Excel o email.
              Le righe estratte vengono mostrate in una tabella modificabile: <b>nessun dato viene salvato senza la tua conferma</b>.
            </p>
            {busy && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm" role="status" aria-live="polite">
                <p className="font-medium">Lettura accurata in corso…</p>
                <p className="mt-1 text-muted-foreground">Attendi il completamento: per documenti lunghi possono servire alcuni minuti.</p>
              </div>
            )}
            <div className="rounded-lg border border-dashed border-border/60 p-3">
              <Label className="text-xs">Documento PDF (max 20 MB)</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPdf(f); }} />
                {pdf && <Button variant="ghost" size="sm" onClick={() => setPdf(null)}>Rimuovi</Button>}
              </div>
              {pdf && <p className="mt-1 text-xs text-muted-foreground">PDF caricato: <b>{pdf.name}</b></p>}
            </div>
            <div>
              <Label className="text-xs">…oppure incolla il testo</Label>
              <Textarea
                rows={7} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={"02/06/2026  ROSSI MARIO  PS  UDINE  38,5\n05/06/2026  BIANCHI LUIGI  MED A  TRIESTE  120,4  X2"}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{selected.length} di {drafts.length} righe selezionate</span>
              <Button variant="outline" size="sm" onClick={() => setDrafts((d) => d!.map((r) => ({ ...r, _keep: true })))}>Seleziona tutte</Button>
              <Button variant="outline" size="sm" onClick={() => setDrafts((d) => d!.map((r) => ({ ...r, _keep: false })))}>Deseleziona tutte</Button>
              <Button variant="ghost" size="sm" onClick={() => setDrafts(null)}>Ricarica un altro documento</Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="min-w-28">Tipo</TableHead>
                    <TableHead className="min-w-32">Data</TableHead>
                    <TableHead className="min-w-28">Cognome</TableHead>
                    <TableHead className="min-w-28">Nome</TableHead>
                    <TableHead className="min-w-32">2° paziente</TableHead>
                    <TableHead className="min-w-32">Partenza</TableHead>
                    <TableHead className="min-w-32">Destinazione</TableHead>
                    <TableHead className="w-20">Km</TableHead>
                    <TableHead className="w-24">Prezzo</TableHead>
                    <TableHead className="w-20">Ora part.</TableHead>
                    <TableHead className="w-20">Ora arr.</TableHead>
                    <TableHead className="w-20">Ore sosta</TableHead>
                    <TableHead className="w-24">€ sosta</TableHead>
                    <TableHead className="w-20">Ore inf.</TableHead>
                    <TableHead className="w-24">€/ora inf.</TableHead>
                    <TableHead className="w-16">X2</TableHead>
                    <TableHead className="w-20">Annullato</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((r) => (
                    <TableRow key={r._id} className={r._keep ? "" : "opacity-50"}>
                      <TableCell><Checkbox checked={r._keep} onCheckedChange={(v) => patch(r._id, { _keep: !!v })} /></TableCell>
                      <TableCell>
                        <Select value={r.kind} onValueChange={(v) => patch(r._id, { kind: v as Kind })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(["intra", "other", "nurse"] as Kind[]).map((k) => <SelectItem key={k} value={k}>{kindLabel[k]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input className="h-8" type="date" value={(r.date || "").slice(0, 10)} onChange={(e) => patch(r._id, { date: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8" required aria-label="Cognome obbligatorio" value={r.last_name || ""} onChange={(e) => patch(r._id, { last_name: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8" value={r.first_name || ""} onChange={(e) => patch(r._id, { first_name: e.target.value })} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Input className="h-8" placeholder="Cognome" value={r.last_name_2 || ""} onChange={(e) => patch(r._id, { last_name_2: e.target.value })} />
                          <Input className="h-8" placeholder="Nome" value={r.first_name_2 || ""} onChange={(e) => patch(r._id, { first_name_2: e.target.value })} />
                        </div>
                      </TableCell>
                      <TableCell><Input className="h-8" value={r.departure || ""} onChange={(e) => patch(r._id, { departure: e.target.value })} /></TableCell>
                      <TableCell>
                        <Input className="h-8" value={r.arrival || ""} onChange={(e) => patch(r._id, { arrival: e.target.value })} />
                        {r._dup && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> già presente
                          </span>
                        )}
                      </TableCell>
                      <TableCell><Input className="h-8" inputMode="decimal" value={r.kilometers ?? ""} onChange={(e) => patch(r._id, { kilometers: e.target.value === "" ? null : Number(String(e.target.value).replace(",", ".")) })} /></TableCell>
                      <TableCell><Input className="h-8" inputMode="decimal" value={r.price ?? ""} onChange={(e) => patch(r._id, { price: e.target.value === "" ? null : Number(String(e.target.value).replace(",", ".")) })} /></TableCell>
                      <TableCell><Input className="h-8" type="time" value={r.departure_time || ""} onChange={(e) => patch(r._id, { departure_time: e.target.value || null })} /></TableCell>
                      <TableCell><Input className="h-8" type="time" value={r.arrival_time || ""} onChange={(e) => patch(r._id, { arrival_time: e.target.value || null })} /></TableCell>
                      <TableCell><Input className="h-8" inputMode="decimal" value={r.sosta_hours ?? ""} onChange={(e) => patch(r._id, { sosta_hours: e.target.value === "" ? null : Number(String(e.target.value).replace(",", ".")) })} /></TableCell>
                      <TableCell><Input className="h-8" inputMode="decimal" value={r.sosta_price ?? ""} onChange={(e) => patch(r._id, { sosta_price: e.target.value === "" ? null : Number(String(e.target.value).replace(",", ".")) })} /></TableCell>
                      <TableCell><Input className="h-8" inputMode="decimal" disabled={r.kind !== "nurse"} value={r.kind === "nurse" ? r.nurse_hours ?? "" : ""} onChange={(e) => patch(r._id, { nurse_hours: e.target.value === "" ? null : Number(String(e.target.value).replace(",", ".")) })} /></TableCell>
                      <TableCell><Input className="h-8" inputMode="decimal" disabled={r.kind !== "nurse"} value={r.kind === "nurse" ? r.nurse_hourly ?? "" : ""} onChange={(e) => patch(r._id, { nurse_hourly: e.target.value === "" ? null : Number(String(e.target.value).replace(",", ".")) })} /></TableCell>
                      <TableCell><Checkbox checked={!!r.is_round_trip} onCheckedChange={(v) => patch(r._id, { is_round_trip: !!v })} /></TableCell>
                      <TableCell><Checkbox checked={!!r.annullato} onCheckedChange={(v) => patch(r._id, { annullato: !!v })} /></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setDrafts((d) => d!.filter((x) => x._id !== r._id))}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Chiudi</Button>
          {!drafts
            ? <Button onClick={runParse} disabled={busy}>{busy ? "Analisi in corso…" : "Leggi documento"}</Button>
            : <Button onClick={confirm} disabled={busy || selected.length === 0}>{busy ? "Salvataggio…" : `Importa ${selected.length} righe`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
