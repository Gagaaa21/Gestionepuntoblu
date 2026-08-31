/**
 * Nucleo condiviso della scheda "Trasporti secondari".
 *
 * Regole non negoziabili:
 * - I dati salvati a database restano identici (stesse colonne, stessi valori).
 * - Nulla viene mai riscritto automaticamente: km, prezzi e testi sono
 *   esattamente quelli digitati dall'operatore. Le tariffe sono SOLO
 *   suggerimenti che si applicano con un clic.
 * - Un campo lasciato VUOTO può essere completato dal suggerimento;
 *   un campo con "0" resta 0 (viaggi annullati).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, MapPin } from "lucide-react";

// ===================== Tipi =====================
export type Kind = "intra" | "other" | "nurse";
export type Hospital = { id: string; name: string; sort_order: number; kind: "hospital" | "reparto_latisana" };
export type Tariffs = { id: string; per_km: number; sosta_hourly: number; nurse_hourly: number; detailed_time: boolean };
export type IntraTariff = { id: string; departure_id: string; arrival_id: string; price: number; kilometers: number | null };
export type AdiRoute = {
  id: string; departure: string; arrival: string; alias: string | null;
  kilometers: number; price: number;
  kilometers_rt: number | null; price_rt: number | null;
};
export type Transport = {
  id: string;
  kind: Kind;
  transport_date: string;
  first_name: string | null;
  last_name: string | null;
  first_name_2?: string | null;
  last_name_2?: string | null;
  departure_hospital_id: string | null;
  arrival_hospital_id: string | null;
  departure_text: string | null;
  arrival_text: string | null;
  kilometers: number | null;
  price: number | null;
  sosta_hours: number | null;
  sosta_price: number | null;
  nurse_hours: number | null;
  nurse_hourly: number | null;
  is_round_trip: boolean;
  annullato: boolean;
  departure_time: string | null;
  arrival_time: string | null;
  notes: string | null;
  username: string | null;
  adi_route_id: string | null;
  needs_review: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

export type Ctx = {
  hospitals: Hospital[];
  intra: IntraTariff[];
  adiRoutes: AdiRoute[];
  tariffs: Tariffs;
};

/** Stato unico usato sia per l'inserimento sia per la modifica. */
export type FormState = {
  kind: Kind;
  date: string;        // "YYYY-MM-DDTHH:mm"
  first: string;
  last: string;
  twoPatients: boolean;
  first2: string;
  last2: string;
  fromId: string;      // struttura registrata (facoltativa)
  fromText: string;    // testo sempre visibile
  toId: string;
  toText: string;
  km: string;
  price: string;
  sostaH: string;
  sostaPrice: string;
  nurseH: string;
  nurseRate: string;
  depTime: string;
  arrTime: string;
  roundTrip: boolean;
  annullato: boolean;
  notes: string;
  adiRouteId: string;
  needsReview: boolean;
};

// ===================== Utility =====================
export const monthNames = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

export const eur = (n: number) => `€ ${(Number(n) || 0).toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

export const num = (v: any): number | null => {
  if (v == null || v === "") return null;
  const s = String(v).replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const pad = (n: number) => String(n).padStart(2, "0");
export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Sostituisce la parte data mantenendo l'orario già presente. */
export const withDatePart = (value: string, datePart: string) => {
  const time = value.includes("T") ? value.split("T")[1] : "00:00";
  return `${datePart}T${time || "00:00"}`;
};

export const stripRoundTrip = (s: string): { text: string; rt: boolean } => {
  const t = (s || "").trim();
  const m = t.match(/^(.*?)(?:\s*(?:x\s*2|X2|a\/r|A\/R|andata e ritorno))\s*$/i);
  return m ? { text: m[1].trim(), rt: true } : { text: t, rt: false };
};

export const LATISANA_DEPTS = ["PS","PPI","MED","MED A","MED B","MED C","PED","ORT","ORL","CHI","GIN","DH","RSA","CARDIO","NEURO","ONCO","URO","OSTE","DIALISI"];
export const isLatisanaDeptSigla = (s?: string | null) => !!s && LATISANA_DEPTS.includes(s.trim().toUpperCase());

/** Etichetta paziente: "Rossi Mario" oppure "Rossi Mario + Bianchi L." */
export const patientLabel = (t: {
  first_name?: string | null; last_name?: string | null;
  first_name_2?: string | null; last_name_2?: string | null;
}) => {
  const one = `${t.last_name || ""} ${t.first_name || ""}`.trim();
  const two = `${t.last_name_2 || ""} ${t.first_name_2 || ""}`.trim();
  return two ? (one ? `${one} + ${two}` : two) : one;
};

export const nrmRaw = (s?: string | null) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

export const emptyForm = (kind: Kind, date?: string): FormState => ({
  kind,
  date: date || toLocalInput(new Date()),
  first: "", last: "",
  twoPatients: false, first2: "", last2: "",
  fromId: "", fromText: "", toId: "", toText: "",
  km: "", price: "", sostaH: "", sostaPrice: "",
  nurseH: "", nurseRate: "",
  depTime: "", arrTime: "",
  roundTrip: false, annullato: false, notes: "",
  adiRouteId: "", needsReview: false,
});

// ===================== Logica tariffe (pura) =====================
export const latisanaHospitalId = (c: Ctx) =>
  c.hospitals.find((h) => h.kind !== "reparto_latisana" && /latisana/i.test(h.name))?.id ?? null;

export const canonicalId = (c: Ctx, id?: string | null) => {
  if (!id) return null;
  const h = c.hospitals.find((x) => x.id === id);
  if (h?.kind === "reparto_latisana") return latisanaHospitalId(c) ?? id;
  return id;
};

/** Risolve una struttura anche da testo libero (reparti Latisana inclusi). */
export const hospitalIdByName = (c: Ctx, name?: string | null): string | null => {
  const raw = (name || "").trim();
  if (!raw) return null;
  const sigla = raw.replace(/^latisana\s*\(?/i, "").replace(/\)$/, "").trim();
  if (isLatisanaDeptSigla(raw) || isLatisanaDeptSigla(sigla) || /latisana/i.test(raw)) {
    const lat = latisanaHospitalId(c);
    if (lat) return lat;
  }
  const n = raw.toLowerCase();
  const exact = c.hospitals.find((h) => (h.name || "").trim().toLowerCase() === n);
  if (exact) return canonicalId(c, exact.id);
  const partial = c.hospitals.find(
    (h) => h.kind !== "reparto_latisana" && (h.name || "").trim().toLowerCase().includes(n),
  );
  return partial ? partial.id : null;
};

export const intraPair = (c: Ctx, fromId: string, toId: string): IntraTariff | null => {
  const exact = c.intra.find((x) => x.departure_id === fromId && x.arrival_id === toId);
  if (exact) return exact;
  const cf = canonicalId(c, fromId);
  const ct = canonicalId(c, toId);
  if (cf === fromId && ct === toId) return null;
  return c.intra.find((x) => x.departure_id === cf && x.arrival_id === ct) ?? null;
};

export const isLatisanaText = (c: Ctx, s?: string | null) => {
  const t = nrmRaw(s);
  if (!t) return false;
  if (t.includes("latisana")) return true;
  if (isLatisanaDeptSigla(t)) return true;
  return c.hospitals.some((h) => h.kind === "reparto_latisana" && nrmRaw(h.name) === t);
};

export const nrm = (c: Ctx, s?: string | null) => (isLatisanaText(c, s) ? "latisana" : nrmRaw(s));

/**
 * Riconosce una tratta ADI registrata. Le tratte con alias richiedono
 * l'alias esatto; nessun match parziale o "fuzzy".
 */
export const findAdiRoute = (c: Ctx, fromText: string, toText: string): AdiRoute | null => {
  const a = nrm(c, fromText);
  const b = nrm(c, toText);
  const aRaw = nrmRaw(fromText);
  const bRaw = nrmRaw(toText);
  if (!a && !b) return null;
  const al = (r: AdiRoute) => nrmRaw(r.alias);
  let hit = c.adiRoutes.find(
    (r) => !al(r) && ((a === nrm(c, r.departure) && b === nrm(c, r.arrival)) || (a === nrm(c, r.arrival) && b === nrm(c, r.departure))),
  );
  if (hit) return hit;
  hit = c.adiRoutes.find((r) => {
    const alias = al(r);
    if (!alias) return false;
    const ends = [nrm(c, r.departure), nrm(c, r.arrival)];
    return (aRaw === alias && ends.includes(b)) || (bRaw === alias && ends.includes(a));
  });
  if (hit) return hit;
  hit = c.adiRoutes.find((r) => {
    const alias = al(r);
    if (!alias) return false;
    return (aRaw === alias && !b) || (bRaw === alias && !a) || (aRaw === alias && bRaw === alias);
  });
  return hit ?? null;
};

export const linkedAdiRoute = (c: Ctx, f: FormState): AdiRoute | null =>
  c.adiRoutes.find((route) => route.id === f.adiRouteId) ?? findAdiRoute(c, f.fromText, f.toText);

/** Valori della tratta ADI in base allo stato A/R: mai raddoppi automatici. */
export const adiValues = (r: AdiRoute, rt: boolean) => ({
  km: rt ? (r.kilometers_rt ?? r.kilometers) : r.kilometers,
  price: rt ? (r.price_rt ?? r.price) : r.price,
  hasRtPrice: r.price_rt != null,
});

export type Suggestion = {
  label: string;
  detail?: string;
  km: number | null;
  price: number;
  source: "tratta" | "alias" | "km" | "ore";
};

/** Suggerimento tariffario per lo stato corrente del modulo (non applica nulla). */
export function computeSuggestion(c: Ctx, f: FormState): Suggestion | null {
  const perKm = Number(c.tariffs.per_km) || 0;
  const typedKm = num(f.km);

  if (f.kind === "nurse") {
    const h = num(f.nurseH);
    const rate = num(f.nurseRate) ?? Number(c.tariffs.nurse_hourly) ?? 0;
    if (h == null || rate <= 0) return null;
    return { label: `${h} h × ${eur(rate)}`, km: null, price: h * rate, source: "ore" };
  }

  if (f.kind === "intra") {
    const from = canonicalId(c, f.fromId) || hospitalIdByName(c, f.fromText);
    const to = canonicalId(c, f.toId) || hospitalIdByName(c, f.toText);
    const pair = from && to ? intraPair(c, from, to) : null;
    if (pair) {
      const factor = f.roundTrip ? 2 : 1;
      return {
        label: "Tariffa di tratta registrata",
        detail: f.roundTrip ? "importo e km raddoppiati per l'andata e ritorno" : undefined,
        km: pair.kilometers != null ? Number(pair.kilometers) * factor : null,
        price: Number(pair.price) * factor,
        source: "tratta",
      };
    }
    if (typedKm != null && perKm > 0) {
      return { label: `${typedKm} km × ${eur(perKm)}`, km: null, price: typedKm * perKm, source: "km" };
    }
    return null;
  }

  // ADI / altri
  const route = linkedAdiRoute(c, f);
  if (route) {
    const v = adiValues(route, f.roundTrip);
    return {
      label: `Tratta ricorrente${route.alias ? ` “${route.alias}”` : ""}`,
      detail: f.roundTrip
        ? (v.hasRtPrice ? "importo fisso A/R registrato" : "nessun importo A/R registrato: uso la sola andata")
        : `${route.departure} → ${route.arrival}`,
      km: v.km != null ? Number(v.km) : null,
      price: Number(v.price) || 0,
      source: route.alias ? "alias" : "tratta",
    };
  }
  if (typedKm != null && perKm > 0) {
    return { label: `${typedKm} km × ${eur(perKm)}`, km: null, price: typedKm * perKm, source: "km" };
  }
  return null;
}

/** Espande un alias ADI nei suoi estremi reali (i dati salvati non cambiano). */
export function resolveAdiEnds(c: Ctx, f: FormState): { from: string; to: string } {
  let from = f.fromText.trim();
  let to = f.toText.trim();
  const route = linkedAdiRoute(c, f);
  if (route) {
    const alias = nrmRaw(route.alias);
    if (alias && (nrmRaw(from) === alias || !from)) from = nrm(c, to) === nrm(c, route.departure) ? route.arrival : route.departure;
    if (alias && (nrmRaw(to) === alias || !to)) to = nrm(c, from) === nrm(c, route.departure) ? route.arrival : route.departure;
    from ||= route.departure;
    to ||= route.arrival;
  }
  return { from, to };
}

/**
 * Costruisce il payload database dallo stato del modulo.
 * I valori digitati vincono sempre; il suggerimento riempie solo i campi vuoti.
 */
export function buildPayload(c: Ctx, f: FormState): { error: string } | { data: Record<string, any> } {
  const parsed = new Date(f.date);
  if (isNaN(parsed.getTime())) return { error: "Inserisci una data valida" };
  if (!f.last.trim()) return { error: "Il cognome del paziente è obbligatorio" };
  if (f.twoPatients && !f.last2.trim()) return { error: "Inserisci il cognome del secondo paziente" };
  const sug = computeSuggestion(c, f);

  const sostaH = num(f.sostaH) ?? 0;
  const sostaPrice = num(f.sostaPrice) ?? sostaH * (Number(c.tariffs.sosta_hourly) || 0);

  const data: Record<string, any> = {
    transport_date: parsed.toISOString(),
    first_name: f.first.trim() || null,
    last_name: f.last.trim() || null,
    first_name_2: f.twoPatients ? (f.first2.trim() || null) : null,
    last_name_2: f.twoPatients ? (f.last2.trim() || null) : null,
    notes: f.notes.trim() || null,
    sosta_hours: sostaH,
    sosta_price: sostaPrice,
    is_round_trip: f.roundTrip,
    annullato: f.annullato,
    departure_time: f.depTime || null,
    arrival_time: f.arrTime || null,
    needs_review: f.needsReview,
    reviewed_at: f.needsReview ? null : new Date().toISOString(),
  };

  const priceTyped = num(f.price);
  const kmTyped = num(f.km);
  const price = priceTyped ?? (f.annullato ? 0 : (sug?.price ?? 0));
  const km = kmTyped ?? (f.annullato ? 0 : (sug?.km ?? 0));

  if (f.kind === "nurse") {
    data.arrival_text = f.toText.trim() || null;
    data.nurse_hours = num(f.nurseH) ?? 0;
    data.nurse_hourly = num(f.nurseRate) ?? Number(c.tariffs.nurse_hourly) ?? 0;
    data.price = price;
    return { data };
  }

  if (f.kind === "intra") {
    if (!f.fromId && !f.fromText.trim() && !f.toId && !f.toText.trim()) {
      return { error: "Indica almeno la partenza o la destinazione" };
    }
    data.departure_hospital_id = f.fromId || null;
    data.arrival_hospital_id = f.toId || null;
    data.departure_text = f.fromId ? null : (f.fromText.trim() || null);
    data.arrival_text = f.toId ? null : (f.toText.trim() || null);
    data.kilometers = km;
    data.price = price;
    return { data };
  }

  const { from, to } = resolveAdiEnds(c, f);
  if (!from && !to) return { error: "Indica almeno partenza, destinazione o l'alias esatto" };
  data.departure_text = from || null;
  data.arrival_text = to || null;
  data.adi_route_id = linkedAdiRoute(c, f)?.id ?? null;
  data.kilometers = km;
  data.price = price;
  return { data };
}

/** Trasforma una riga salvata nello stato del modulo (per modifica/duplica). */
export function formFromTransport(t: Transport): FormState {
  return {
    kind: t.kind,
    date: toLocalInput(new Date(t.transport_date)),
    first: t.first_name || "",
    last: t.last_name || "",
    twoPatients: !!(t.first_name_2 || t.last_name_2),
    first2: t.first_name_2 || "",
    last2: t.last_name_2 || "",
    fromId: t.departure_hospital_id || "",
    fromText: t.departure_text || "",
    toId: t.arrival_hospital_id || "",
    toText: t.arrival_text || "",
    km: t.kilometers == null ? "" : String(t.kilometers),
    price: t.price == null ? "" : String(t.price),
    sostaH: t.sosta_hours == null ? "" : String(t.sosta_hours),
    sostaPrice: t.sosta_price == null ? "" : String(t.sosta_price),
    nurseH: t.nurse_hours == null ? "" : String(t.nurse_hours),
    nurseRate: t.nurse_hourly == null ? "" : String(t.nurse_hourly),
    depTime: t.departure_time || "",
    arrTime: t.arrival_time || "",
    roundTrip: !!t.is_round_trip,
    annullato: !!t.annullato,
    notes: t.notes || "",
    adiRouteId: t.adi_route_id || "",
    needsReview: !!t.needs_review,
  };
}

/** Etichetta leggibile della struttura selezionata o del testo scritto. */
export function placeLabel(c: Ctx, id: string | null, text: string | null) {
  const h = c.hospitals.find((x) => x.id === id);
  if (h?.kind === "reparto_latisana") return `LATISANA (${h.name})`;
  if (h) return h.name;
  const t = (text || "").trim();
  if (!t) return "—";
  if (isLatisanaDeptSigla(t)) return `LATISANA (${t.toUpperCase()})`;
  return t;
}

// ===================== UI riusabile =====================
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export type PlaceOption = { id: string; name: string; group: string };

/**
 * Campo luogo unico: si digita liberamente e, se serve, si sceglie una voce
 * registrata dall'elenco. Il testo scritto resta SEMPRE visibile.
 */
export function PlaceField({
  id, text, options, placeholder, onChange,
}: {
  id: string;
  text: string;
  options: PlaceOption[];
  placeholder?: string;
  onChange: (id: string, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const q = nrmRaw(text);
    const list = q ? options.filter((o) => nrmRaw(o.name).includes(q)) : options;
    return list.slice(0, 40);
  }, [options, text]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Le voci "free:" sono testi già usati in passato: non hanno una struttura registrata
  const pick = (o: PlaceOption) => {
    if (o.id.startsWith("free:")) onChange("", o.name);
    else onChange(o.id, o.name);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={text}
        placeholder={placeholder}
        onChange={(e) => { onChange("", e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && matches[active]) { e.preventDefault(); pick(matches[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {id && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600" title="Struttura registrata">
          <Check className="h-4 w-4" />
        </span>
      )}
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {matches.map((o, i) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === active ? "bg-accent" : ""}`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{o.name}</span>
              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{o.group}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
