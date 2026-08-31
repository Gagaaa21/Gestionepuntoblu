/**
 * Modulo unico di inserimento e modifica dei trasporti secondari.
 * Lo stesso componente è usato dalla scheda di registrazione e dalla
 * finestra di modifica: i campi visibili sono sempre gli stessi.
 */
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Flag, Sparkles, Users, Wand2 } from "lucide-react";
import {
  Ctx, FormState, PlaceOption, Field, PlaceField, Suggestion,
  computeSuggestion, eur, linkedAdiRoute, num, withDatePart,
} from "./shared";

export function TransportForm({
  value, onChange, ctx, places, duplicate, quickChips, historyChips, compact,
}: {
  value: FormState;
  onChange: (patch: Partial<FormState>) => void;
  ctx: Ctx;
  places: PlaceOption[];
  duplicate?: boolean;
  quickChips?: React.ReactNode;
  historyChips?: React.ReactNode;
  compact?: boolean;
}) {
  const f = value;
  const sug: Suggestion | null = computeSuggestion(ctx, f);
  const adiRoute = f.kind === "other" ? linkedAdiRoute(ctx, f) : null;
  const linked = sug?.source === "tratta" || sug?.source === "alias";
  const sostaAuto = (num(f.sostaH) ?? 0) * (Number(ctx.tariffs.sosta_hourly) || 0);

  const applySuggestion = () => {
    if (!sug) return;
    const patch: Partial<FormState> = { price: String(Number(sug.price.toFixed(3))) };
    if (sug.km != null) patch.km = String(Number(Number(sug.km).toFixed(3)));
    onChange(patch);
  };

  const swap = () => onChange({
    fromId: f.toId, fromText: f.toText,
    toId: f.fromId, toText: f.fromText,
  });

  const changePlace = (side: "from" | "to", id: string, text: string) => {
    const next = { ...f, ...(side === "from" ? { fromId: id, fromText: text } : { toId: id, toText: text }) };
    const nextSuggestion = computeSuggestion(ctx, next);
    const route = next.kind === "other" ? linkedAdiRoute(ctx, { ...next, adiRouteId: "" }) : null;
    const auto: Partial<FormState> = side === "from"
      ? { fromId: id, fromText: text, adiRouteId: route?.id ?? "" }
      : { toId: id, toText: text, adiRouteId: route?.id ?? "" };
    if ((nextSuggestion?.source === "tratta" || nextSuggestion?.source === "alias")) {
      if (f.km === "" && nextSuggestion.km != null) auto.km = String(Number(nextSuggestion.km.toFixed(3)));
      if (f.price === "") auto.price = String(Number(nextSuggestion.price.toFixed(3)));
    }
    onChange(auto);
  };

  return (
    <div className="space-y-4">
      {/* Riga 1 · quando e chi */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Data" hint={compact ? undefined : "Resta invariata fino al cambio"}>
          <Input
            type="date"
            value={(f.date || "").slice(0, 10)}
            onChange={(e) => onChange({ date: withDatePart(f.date, e.target.value) })}
          />
        </Field>
        <Field label="Cognome *">
          <Input value={f.last} onChange={(e) => onChange({ last: e.target.value })} placeholder="Obbligatorio" required />
        </Field>
        <Field label="Nome">
          <Input value={f.first} onChange={(e) => onChange({ first: e.target.value })} placeholder="Facoltativo" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Ora part."><Input type="time" value={f.depTime} onChange={(e) => onChange({ depTime: e.target.value })} /></Field>
          <Field label="Ora arrivo"><Input type="time" value={f.arrTime} onChange={(e) => onChange({ arrTime: e.target.value })} /></Field>
        </div>
      </div>

      {/* Secondo paziente sullo stesso viaggio */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={f.twoPatients} onCheckedChange={(v) => onChange({ twoPatients: !!v, ...(v ? {} : { first2: "", last2: "" }) })} />
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Viaggio con due pazienti</span>
        </label>
        {f.twoPatients && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Cognome 2° paziente *">
              <Input value={f.last2} onChange={(e) => onChange({ last2: e.target.value })} placeholder="Obbligatorio" required />
            </Field>
            <Field label="Nome 2° paziente">
              <Input value={f.first2} onChange={(e) => onChange({ first2: e.target.value })} placeholder="Anche abbreviato" />
            </Field>
          </div>
        )}
      </div>

      {historyChips}
      {quickChips}

      {/* Riga 2 · tratta */}
      {f.kind === "nurse" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Destinazione">
            <PlaceField
              id={f.toId} text={f.toText} options={places}
              placeholder="Scrivi liberamente o scegli"
              onChange={(id, text) => changePlace("to", id, text)}
            />
          </Field>
          <Field label="Ore"><Input inputMode="decimal" value={f.nurseH} onChange={(e) => onChange({ nurseH: e.target.value })} /></Field>
          <Field label="Tariffa oraria (€)">
            <Input
              inputMode="decimal"
              placeholder={String(ctx.tariffs.nurse_hourly ?? 35)}
              value={f.nurseRate}
              onChange={(e) => onChange({ nurseRate: e.target.value })}
            />
          </Field>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field label={f.kind === "intra" ? "Partenza (reparto, ospedale o testo libero)" : "Partenza"}>
            <PlaceField
              id={f.fromId} text={f.fromText} options={places}
              placeholder="Scrivi liberamente o scegli"
              onChange={(id, text) => changePlace("from", id, text)}
            />
          </Field>
          <Button type="button" variant="outline" size="icon" title="Inverti partenza e destinazione" onClick={swap} className="mb-0.5 hidden sm:inline-flex">
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <Field label={f.kind === "intra" ? "Destinazione (struttura o testo libero)" : "Destinazione o alias esatto"}>
            <PlaceField
              id={f.toId} text={f.toText} options={places}
              placeholder="Scrivi liberamente o scegli"
              onChange={(id, text) => changePlace("to", id, text)}
            />
          </Field>
          <Button type="button" variant="outline" size="sm" onClick={swap} className="sm:hidden">
            <ArrowLeftRight className="h-4 w-4 mr-1" /> Inverti
          </Button>
        </div>
      )}

      {/* Riga 3 · importi (mai riscritti automaticamente) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {f.kind !== "nurse" && (
          <Field label={`Chilometri${f.roundTrip ? " · totale" : ""}`}>
            <Input inputMode="decimal" value={f.km} onChange={(e) => onChange({ km: e.target.value })} placeholder="0 ammesso" />
          </Field>
        )}
        <Field label={`Prezzo (€)${f.roundTrip ? " · totale" : ""}`}>
          <Input inputMode="decimal" value={f.price} onChange={(e) => onChange({ price: e.target.value })} placeholder="0 ammesso" />
        </Field>
        {f.kind !== "nurse" && (
          <>
            <Field label="Ore di sosta">
              <Input
                inputMode="decimal"
                value={f.sostaH}
                onChange={(e) => {
                  const v = e.target.value;
                  const h = num(v);
                  const auto = h == null ? "" : String(Number((h * (Number(ctx.tariffs.sosta_hourly) || 0)).toFixed(3)));
                  // Il prezzo sosta segue le ore solo finché non viene toccato a mano
                  const untouched = f.sostaPrice === "" || f.sostaPrice === String(Number(((num(f.sostaH) ?? 0) * (Number(ctx.tariffs.sosta_hourly) || 0)).toFixed(3)));
                  onChange(untouched ? { sostaH: v, sostaPrice: auto } : { sostaH: v });
                }}
              />
            </Field>
            <Field label="Prezzo sosta (€)" hint={`Automatico: ${eur(sostaAuto)}`}>
              <Input inputMode="decimal" value={f.sostaPrice} onChange={(e) => onChange({ sostaPrice: e.target.value })} />
            </Field>
          </>
        )}
      </div>

      {/* Le tratte riconosciute si collegano da sole e compilano solo campi vuoti. */}
      {sug && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          {linked ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Wand2 className="h-3.5 w-3.5 text-primary" />}
          <span>
            <b>{linked ? "Collegata automaticamente" : sug.label}</b> → {eur(sug.price)}
            {sug.km != null && <> · {Number(sug.km).toFixed(1)} km</>}
            {adiRoute?.alias && <span className="text-muted-foreground"> · {adiRoute.alias}</span>}
            {!linked && sug.detail && <span className="text-muted-foreground"> · {sug.detail}</span>}
          </span>
          {!linked && <Button type="button" size="sm" variant="outline" className="ml-auto h-7" onClick={applySuggestion}>Applica</Button>}
        </div>
      )}

      {duplicate && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          Esiste già un trasporto molto simile in questa data: controlla prima di salvare.
        </div>
      )}

      {/* Riga 4 · opzioni e note */}
      <div className="grid gap-3 sm:grid-cols-[auto_auto_auto_1fr] sm:items-start">
        {f.kind !== "nurse" && (
          <>
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
              <Switch checked={f.roundTrip} onCheckedChange={(v) => onChange({ roundTrip: !!v })} />
              <span>Andata e ritorno <b className="text-destructive">X2</b></span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
              <Switch checked={f.annullato} onCheckedChange={(v) => onChange({ annullato: !!v })} />
              Annullato
            </label>
          </>
        )}
        <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
          <Switch checked={f.needsReview} onCheckedChange={(v) => onChange({ needsReview: !!v })} />
          <span className="inline-flex items-center gap-1"><Flag className="h-3.5 w-3.5" /> Da revisionare</span>
        </label>
        <Field label="Note">
          <Textarea rows={2} value={f.notes} onChange={(e) => onChange({ notes: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

export function HistoryChips({ items, onApply }: { items: any[]; onApply: (s: any) => void }) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary" /> Storico del paziente · un clic per compilare
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onApply(s)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent transition"
          >
            {s.first_name ? `${s.first_name} · ` : ""}
            {s.departure_text || "—"} → {s.arrival_text || "—"}
            {s.is_round_trip ? " X2" : ""}
            <span className="ml-2 text-muted-foreground">×{s.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function QuickRouteChips({ routes, selectedId, onApply }: { routes: any[]; selectedId?: string; onApply: (r: any) => void }) {
  if (!routes.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Viaggi frequenti · scegli e continua</p>
      <div className="flex flex-wrap gap-2">
        {routes.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onApply(r)}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${selectedId === r.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-accent"}`}
            title={`${r.departure} → ${r.arrival} · ${Number(r.kilometers ?? 0).toFixed(1)} km`}
          >
            {r.alias || `${r.departure} → ${r.arrival}`}
          </button>
        ))}
      </div>
    </div>
  );
}
