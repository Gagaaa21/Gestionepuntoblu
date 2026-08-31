import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAiGateway } from "./ai-gateway.server";
import type { ForecastDay, ForecastResponse, PresenceLevel } from "./forecast.types";

/** Lignano Sabbiadoro (approx.) */
const LAT = 45.6828;
const LON = 13.1274;

const MODEL = "google/gemini-2.5-flash";
const CACHE_KEY = "forecast:lignano:7d";
const FRESH_CACHE_MS = 45 * 60 * 1000;
const STALE_CACHE_MS = 36 * 60 * 60 * 1000;
const WD = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
// MET Norway richiede uno User-Agent identificativo (ToS).
const MET_UA = "PuntoBluLignano/1.0 (https://gestionepuntoblu.lovable.app)";

type DaySignals = {
  holidayIT: string | null;
  holidayDE: string | null;
  holidayAT: string | null;
  schoolDE: number;
  schoolAT: number;
  schoolIT: number;
};

type OpenHoliday = {
  startDate: string;
  endDate: string;
  name?: { language: string; text: string }[];
  nationwide?: boolean;
  subdivisions?: { code: string }[];
};

type CacheEnvelope = {
  storedAt: string;
  forecast: ForecastResponse;
};

const DE_LAENDER = 16;
const AT_LAENDER = 9;
const IT_REGIONI = 20;

let memoryCache: { at: number; value: ForecastResponse } | null = null;

/* ------------------------------------------------------------------ *
 * Helpers calendario
 * ------------------------------------------------------------------ */

function pickName(names?: { language: string; text: string }[]): string {
  if (!names || !names.length) return "";
  const it = names.find((n) => n.language === "IT");
  const en = names.find((n) => n.language === "EN");
  return (it ?? en ?? names[0]).text;
}

function overlaps(iso: string, h: OpenHoliday): boolean {
  return iso >= h.startDate && iso <= h.endDate;
}

async function fetchHolidays(
  country: string,
  kind: "PublicHolidays" | "SchoolHolidays",
  from: string,
  to: string,
): Promise<OpenHoliday[]> {
  const url = `https://openholidaysapi.org/${kind}?countryIsoCode=${country}&languageIsoCode=IT&validFrom=${from}&validTo=${to}`;
  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) return [];
    return (await r.json()) as OpenHoliday[];
  } catch {
    return [];
  }
}

async function loadSignals(dates: string[]): Promise<Record<string, DaySignals>> {
  if (!dates.length) return {};
  const from = dates[0];
  const to = dates[dates.length - 1];
  const [phIT, phDE, phAT, shIT, shDE, shAT] = await Promise.all([
    fetchHolidays("IT", "PublicHolidays", from, to),
    fetchHolidays("DE", "PublicHolidays", from, to),
    fetchHolidays("AT", "PublicHolidays", from, to),
    fetchHolidays("IT", "SchoolHolidays", from, to),
    fetchHolidays("DE", "SchoolHolidays", from, to),
    fetchHolidays("AT", "SchoolHolidays", from, to),
  ]);

  const out: Record<string, DaySignals> = {};
  for (const iso of dates) {
    const ph = (list: OpenHoliday[]) => {
      const hit = list.find((h) => overlaps(iso, h));
      return hit ? pickName(hit.name) : null;
    };
    const schoolFrac = (list: OpenHoliday[], total: number): number => {
      const active = list.filter((h) => overlaps(iso, h));
      if (!active.length) return 0;
      if (active.some((h) => h.nationwide)) return 1;
      const subs = new Set<string>();
      for (const h of active) for (const s of h.subdivisions ?? []) subs.add(s.code);
      return Math.min(1, subs.size / total);
    };
    out[iso] = {
      holidayIT: ph(phIT),
      holidayDE: ph(phDE),
      holidayAT: ph(phAT),
      schoolIT: schoolFrac(shIT, IT_REGIONI),
      schoolDE: schoolFrac(shDE, DE_LAENDER),
      schoolAT: schoolFrac(shAT, AT_LAENDER),
    };
  }
  return out;
}

function isHolidayIT(d: Date): boolean {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const fixed = [
    [1, 1], [1, 6], [4, 25], [5, 1], [6, 2],
    [8, 15], [11, 1], [12, 8], [12, 25], [12, 26],
  ];
  return fixed.some(([mm, dd]) => mm === m && dd === day);
}

/** Ferragosto è il picco assoluto; boost su +/- 7gg che decresce linearmente. */
function ferragostoProximity(date: Date): number {
  const y = date.getFullYear();
  const ferragosto = new Date(Date.UTC(y, 7, 15));
  const diff = Math.abs((date.getTime() - ferragosto.getTime()) / 86400000);
  if (diff <= 7) return 1 - diff / 7;
  return 0;
}

/** Curva stagionale per settimana ISO (0..1). Picco su settimane 32-33 (Ferragosto). */
function seasonFactor(d: Date): number {
  const m = d.getMonth() + 1;
  if (m === 8) return 1;
  if (m === 7) return 0.95;
  if (m === 6) return 0.75;
  if (m === 9) return 0.7;
  if (m === 5) return 0.5;
  if (m === 4 || m === 10) return 0.3;
  return 0.1;
}

/**
 * Rileva un "ponte": festivo IT infrasettimanale + weekend adiacente,
 * oppure feriale schiacciato tra festivo/weekend e altro festivo/weekend.
 */
function detectBridge(iso: string, sig: Record<string, DaySignals>, dt: Date): boolean {
  const dow = dt.getDay();
  const isHoliday = (day: Date, s?: DaySignals) => !!s?.holidayIT || isHolidayIT(day);
  const yest = new Date(dt.getTime() - 86400000);
  const tmrw = new Date(dt.getTime() + 86400000);
  const yestIso = yest.toISOString().slice(0, 10);
  const tmrwIso = tmrw.toISOString().slice(0, 10);
  const isNonWorking = (day: Date, s?: DaySignals) => {
    const dw = day.getDay();
    return dw === 0 || dw === 6 || isHoliday(day, s);
  };
  // Solo giorni lavorativi (lun-ven) possono essere "ponte"
  if (dow === 0 || dow === 6) return false;
  const prevNW = isNonWorking(yest, sig[yestIso]);
  const nextNW = isNonWorking(tmrw, sig[tmrwIso]);
  return prevNW && nextNW;
}

/* ------------------------------------------------------------------ *
 * Statistiche storiche interventi (calibrazione principale)
 * ------------------------------------------------------------------ */

export type HistoricalStats = {
  /** Media interventi per giorno-della-settimana (0=Dom..6=Sab), calcolata SOLO sui giorni aperti. */
  dowAvg: number[];
  /** Numero di giorni-aperti considerati per DOW (per capire l'affidabilità). */
  dowSamples: number[];
  /** Massimo giornaliero registrato (per normalizzare in livelli 0-3). */
  overallMax: number;
  /** Numero totale di giorni-aperti nel campione. */
  openDays: number;
  /** Finestra usata (giorni indietro). */
  windowDays: number;
};

const EMPTY_STATS: HistoricalStats = {
  dowAvg: [0, 0, 0, 0, 0, 0, 0],
  dowSamples: [0, 0, 0, 0, 0, 0, 0],
  overallMax: 0,
  openDays: 0,
  windowDays: 0,
};

async function loadHistoricalStats(windowDays = 90): Promise<HistoricalStats> {
  try {
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();
    const { data, error } = await (supabaseAdmin as any)
      .from("interventions")
      .select("intervention_date")
      .gte("intervention_date", since);
    if (error || !data) return EMPTY_STATS;

    // Conta interventi per data (giorni con 0 interventi = chiusi, esclusi)
    const perDate = new Map<string, number>();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric", month: "2-digit", day: "2-digit",
    });
    for (const row of data as { intervention_date: string }[]) {
      if (!row.intervention_date) continue;
      const iso = fmt.format(new Date(row.intervention_date));
      perDate.set(iso, (perDate.get(iso) ?? 0) + 1);
    }

    const dowTotals = [0, 0, 0, 0, 0, 0, 0];
    const dowSamples = [0, 0, 0, 0, 0, 0, 0];
    let overallMax = 0;
    for (const [iso, count] of perDate) {
      if (count <= 0) continue; // giorno chiuso
      const dt = new Date(iso + "T12:00:00");
      const dow = dt.getDay();
      dowTotals[dow] += count;
      dowSamples[dow] += 1;
      if (count > overallMax) overallMax = count;
    }
    const dowAvg = dowTotals.map((t, i) => (dowSamples[i] ? t / dowSamples[i] : 0));
    return {
      dowAvg,
      dowSamples,
      overallMax,
      openDays: perDate.size,
      windowDays,
    };
  } catch {
    return EMPTY_STATS;
  }
}

/** Moltiplicatore meteo/mare/calendario applicato all'atteso storico (0..~1.4). */
function weatherCalendarMultiplier(d: ForecastDay, date: Date, sig?: DaySignals): number {
  const ferra = ferragostoProximity(date);
  const bridgeBoost = d.bridge ? 0.25 : 0;
  const holidayLocal = (sig?.holidayIT || isHolidayIT(date)) ? 0.15 : 0;
  const schoolDEAT = Math.max(sig?.schoolDE ?? 0, sig?.schoolAT ?? 0) * 0.18;
  const holidayDEAT = (sig?.holidayDE || sig?.holidayAT) ? 0.08 : 0;

  const warm = Math.max(0, Math.min(1, (d.tMax - 20) / 15));
  const rain = Math.max(0, Math.min(1, d.precipMm / 8));
  const rainProb = Math.max(0, Math.min(1, d.precipProb / 100));
  const wind = Math.max(0, Math.min(1, (d.windMax - 25) / 25));
  const clouds = d.cloudCover != null ? Math.max(0, Math.min(1, (d.cloudCover - 50) / 50)) : 0;
  const waves = d.waveMax != null ? Math.max(0, Math.min(1, (d.waveMax - 0.8) / 1.5)) : 0;
  const seaWarm = d.seaTemp != null ? Math.max(0, Math.min(1, (d.seaTemp - 20) / 8)) : 0;

  const weatherPos = warm * 0.15 + seaWarm * 0.1;
  const weatherNeg = rain * 0.35 + rainProb * 0.1 + wind * 0.12 + clouds * 0.08 + waves * 0.15;

  const mult = 1 + ferra * 0.2 + bridgeBoost + holidayLocal + holidayDEAT + schoolDEAT + weatherPos - weatherNeg;
  return Math.max(0.15, Math.min(1.5, mult));
}

/**
 * Baseline calibrata sui dati storici reali.
 * expected = mediaStoricaDOW * moltiplicatoreMeteoCalendario
 * Livello mappato su ratio rispetto al max storico osservato.
 */
function baselinePresence(
  d: ForecastDay,
  date: Date,
  sig: DaySignals | undefined,
  hist: HistoricalStats,
): { level: PresenceLevel; expected: number; ratio: number } {
  const dow = date.getDay();
  const mult = weatherCalendarMultiplier(d, date, sig);

  // Fallback quando non ci sono dati storici sufficienti: cade su una curva puramente stagionale
  const season = seasonFactor(date);
  const dowFactor = dow === 6 ? 1 : dow === 0 ? 0.85 : dow === 5 ? 0.6 : d.bridge ? 0.75 : 0.35;
  const seasonalExpected = season * 10 * dowFactor; // 0..10 interventi tipici
  const expected =
    hist.dowSamples[dow] > 0 ? hist.dowAvg[dow] * mult : seasonalExpected * mult;

  const maxRef = hist.overallMax > 0 ? hist.overallMax : 12;
  const ratio = Math.max(0, Math.min(1.3, expected / maxRef));

  let level: PresenceLevel;
  if (ratio >= 0.85) level = 3;
  else if (ratio >= 0.55) level = 2;
  else if (ratio >= 0.28) level = 1;
  else level = 0;

  return { level, expected, ratio };
}

/* ------------------------------------------------------------------ *
 * AI Gateway
 * ------------------------------------------------------------------ */

async function callGateway(prompt: string): Promise<string> {
  return callAiGateway(
    [
      { role: "system", content: "Sei un assistente che stima l'affluenza giornaliera di un punto sanitario a Lignano Sabbiadoro. La stima è CALIBRATA sul reale storico interventi degli ultimi ~90 giorni (solo giorni aperti). " +
            "Ricevi meteo multi-modello, dati marini, bollettino OSMER, calendario (festività IT/DE/AT, ponti, vacanze scolastiche) e una media storica interventi per giorno-della-settimana. Devi restituire SOLO un JSON valido: " +
            `{"summary":"1-2 frasi in italiano che citano i fattori chiave e citano numeri quando utili","days":[{"date":"YYYY-MM-DD","level":0|1|2|3,"reason":"max 14 parole, cita il fattore principale"}]}. ` +
            "Regole prioritarie: " +
            "(1) SCALA STORICA: la media_interventi per DOW e il massimo osservato definiscono la scala reale del posto. Se un mercoledì tipico fa 4 interventi e la domenica ne fa 11, il mercoledì NON è 'Alta' anche se c'è sole. " +
            "(2) MAPPATURA LIVELLI: usa 'ratio_vs_max' come guida — <0.28→0 Bassa, 0.28-0.55→1 Media, 0.55-0.85→2 Alta, >=0.85→3 Molto alta. Puoi discostarti di UN livello al massimo dal baseline_level se hai una ragione forte (Ferragosto, temporale severo, bora forte segnalata OSMER, festivo). " +
            "(3) Un feriale normale (lun-gio) senza festivo/ponte NON può essere 3. Il weekend può essere 3 solo in alta stagione con meteo favorevole. " +
            "(4) I 'ponti' (bridge=true) valgono come weekend. Ferragosto e settimana 32-33 sono il picco assoluto. " +
            "(5) Vacanze scolastiche DE/AT alte = molto turismo tedesco/austriaco (Lignano è meta storica). Le scolastiche IT contano meno ma aiutano nei weekend. " +
            "(6) Mare caldo (>22°C) e cielo sereno favoriscono; onde >1.5m, pioggia >5mm, vento >35 km/h, cielo molto nuvoloso (>80%) sfavoriscono. " +
            "(7) Se due modelli meteo divergono molto, usa quello più conservativo. " +
            "(8) IMPORTANTE: se osmerBollettino è presente, prevale sui modelli globali per la costa (previsione ufficiale ARPA FVG). Cita il fenomeno OSMER nella reason quando rilevante (es. 'bora', 'brezza', 'temporali pomeridiani', 'borino'). " +
            "Nessun testo fuori dal JSON." },
      { role: "user", content: prompt },
    ],
    { model: MODEL, temperature: 0.3, timeoutMs: 30_000 },
  );
}

/* ------------------------------------------------------------------ *
 * Cache persistente
 * ------------------------------------------------------------------ */

function cacheAge(value: ForecastResponse): number {
  const t = new Date(value.updatedAt).getTime();
  return Number.isFinite(t) ? Date.now() - t : Number.POSITIVE_INFINITY;
}

function normalizeCacheEnvelope(value: unknown): ForecastResponse | null {
  const maybe = value as Partial<CacheEnvelope> | ForecastResponse | null;
  const forecast = maybe && "forecast" in maybe ? maybe.forecast : maybe;
  if (!forecast || typeof forecast !== "object") return null;
  const f = forecast as ForecastResponse;
  if (typeof f.location !== "string" || typeof f.updatedAt !== "string" || !Array.isArray(f.days)) return null;
  return f;
}

async function readCachedForecast(maxAgeMs: number): Promise<ForecastResponse | null> {
  if (memoryCache && Date.now() - memoryCache.at <= maxAgeMs) return memoryCache.value;
  try {
    const { data, error } = await (supabaseAdmin as any)
      .from("site_customizations")
      .select("value")
      .eq("key", CACHE_KEY)
      .maybeSingle();
    if (error) return null;
    const value = normalizeCacheEnvelope(data?.value);
    if (!value || cacheAge(value) > maxAgeMs) return null;
    memoryCache = { at: Date.now() - cacheAge(value), value };
    return value;
  } catch {
    return null;
  }
}

async function writeCachedForecast(value: ForecastResponse): Promise<void> {
  memoryCache = { at: Date.now(), value };
  try {
    await (supabaseAdmin as any).from("site_customizations").upsert(
      { key: CACHE_KEY, value: { storedAt: new Date().toISOString(), forecast: value } },
      { onConflict: "key" },
    );
  } catch {
    // La cache persistente non deve mai impedire la visualizzazione delle previsioni.
  }
}

function withStaleNotice(value: ForecastResponse): ForecastResponse {
  const sources = value.sources.includes("Ultima previsione valida salvata")
    ? value.sources
    : [...value.sources, "Ultima previsione valida salvata"];
  return {
    ...value,
    summary: `Aggiornamento meteo temporaneamente non disponibile: mostro l'ultima previsione valida. ${value.summary}`,
    sources,
  };
}

/* ------------------------------------------------------------------ *
 * Fonti meteo
 * ------------------------------------------------------------------ */

type DailyWeather = {
  date: string;
  weatherCode: number;
  tMin: number;
  tMax: number;
  precipMm: number;
  precipProb: number;
  windMax: number;
  uvMax: number;
  cloudCover?: number;
  sunshineHours?: number;
};

async function fetchOpenMeteo(): Promise<DailyWeather[]> {
  // Chiediamo anche cloud cover e sunshine per un quadro più ricco, e usiamo best_match (multi-model ensemble).
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,cloud_cover_mean,sunshine_duration` +
    `&models=best_match&timezone=Europe%2FRome&forecast_days=7`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
  const j = await r.json() as {
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      precipitation_probability_max: number[];
      wind_speed_10m_max: number[];
      uv_index_max: number[];
      cloud_cover_mean?: number[];
      sunshine_duration?: number[];
    };
  };
  const d = j.daily;
  return d.time.map((iso, i) => ({
    date: iso,
    weatherCode: d.weather_code[i] ?? 0,
    tMin: d.temperature_2m_min[i] ?? 0,
    tMax: d.temperature_2m_max[i] ?? 0,
    precipMm: d.precipitation_sum[i] ?? 0,
    precipProb: d.precipitation_probability_max[i] ?? 0,
    windMax: d.wind_speed_10m_max[i] ?? 0,
    uvMax: d.uv_index_max[i] ?? 0,
    cloudCover: d.cloud_cover_mean?.[i],
    sunshineHours: d.sunshine_duration?.[i] != null ? Math.round(d.sunshine_duration[i] / 360) / 10 : undefined,
  }));
}

type MetTs = {
  time: string;
  data: {
    instant: { details: { air_temperature?: number; wind_speed?: number; cloud_area_fraction?: number } };
    next_6_hours?: { details?: { precipitation_amount?: number } };
    next_1_hours?: { details?: { precipitation_amount?: number } };
  };
};

async function fetchMetNorway(): Promise<Map<string, { tMin: number; tMax: number; precipMm: number; windMax: number; cloudCover: number }>> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LAT}&lon=${LON}`;
  const r = await fetch(url, { headers: { accept: "application/json", "User-Agent": MET_UA } });
  if (!r.ok) throw new Error(`MET Norway HTTP ${r.status}`);
  const j = await r.json() as { properties: { timeseries: MetTs[] } };
  const buckets = new Map<string, { temps: number[]; winds: number[]; precip: number[]; clouds: number[] }>();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const seenPrecipSlots = new Set<string>();
  for (const ts of j.properties.timeseries) {
    const dt = new Date(ts.time);
    const iso = fmt.format(dt);
    const b = buckets.get(iso) ?? { temps: [], winds: [], precip: [], clouds: [] };
    const inst = ts.data.instant.details;
    if (inst.air_temperature != null) b.temps.push(inst.air_temperature);
    if (inst.wind_speed != null) b.winds.push(inst.wind_speed * 3.6); // m/s -> km/h
    if (inst.cloud_area_fraction != null) b.clouds.push(inst.cloud_area_fraction);
    // Preferiamo next_6_hours ma senza sovrapporre gli slot 6h
    const p6 = ts.data.next_6_hours?.details?.precipitation_amount;
    const p1 = ts.data.next_1_hours?.details?.precipitation_amount;
    if (p6 != null) {
      const slot = `${iso}:${dt.getUTCHours()}`;
      if (!seenPrecipSlots.has(slot)) {
        seenPrecipSlots.add(slot);
        b.precip.push(p6);
      }
    } else if (p1 != null) {
      b.precip.push(p1);
    }
    buckets.set(iso, b);
  }
  const out = new Map<string, { tMin: number; tMax: number; precipMm: number; windMax: number; cloudCover: number }>();
  for (const [iso, b] of buckets) {
    if (!b.temps.length) continue;
    out.set(iso, {
      tMin: Math.min(...b.temps),
      tMax: Math.max(...b.temps),
      precipMm: b.precip.reduce((a, c) => a + c, 0),
      windMax: b.winds.length ? Math.max(...b.winds) : 0,
      cloudCover: b.clouds.length ? b.clouds.reduce((a, c) => a + c, 0) / b.clouds.length : 0,
    });
  }
  return out;
}

async function fetchMarine(): Promise<Map<string, { seaTemp: number; waveMax: number }>> {
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}` +
    `&daily=wave_height_max,sea_surface_temperature_max&timezone=Europe%2FRome&forecast_days=7`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Marine HTTP ${r.status}`);
  const j = await r.json() as {
    daily: { time: string[]; wave_height_max: (number | null)[]; sea_surface_temperature_max: (number | null)[] };
  };
  const out = new Map<string, { seaTemp: number; waveMax: number }>();
  j.daily.time.forEach((iso, i) => {
    out.set(iso, {
      seaTemp: j.daily.sea_surface_temperature_max[i] ?? 0,
      waveMax: j.daily.wave_height_max[i] ?? 0,
    });
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * OSMER ARPA FVG — bollettino ufficiale della costa (fonte esperta locale)
 * ------------------------------------------------------------------ */

export type OsmerDay = {
  date: string;
  /** Temperatura minima costa (media dell'intervallo pubblicato). */
  coastTMin: number;
  /** Temperatura massima costa (media dell'intervallo pubblicato). */
  coastTMax: number;
  /** Testo del bollettino previsione per il giorno (in italiano). */
  text: string;
};

const MESI_IT: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&agrave;/gi, "à")
    .replace(/&egrave;/gi, "è")
    .replace(/&eacute;/gi, "é")
    .replace(/&igrave;/gi, "ì")
    .replace(/&ograve;/gi, "ò")
    .replace(/&ugrave;/gi, "ù")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

async function fetchOsmer(): Promise<Map<string, OsmerDay>> {
  const r = await fetch("https://www.osmer.fvg.it/home.php", {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 PuntoBluLignano/1.0",
    },
  });
  if (!r.ok) throw new Error(`OSMER HTTP ${r.status}`);
  const raw = await r.text();
  const stripped = raw.replace(/<[^>]+>/g, " ");
  const txt = decodeHtmlEntities(stripped).replace(/\s+/g, " ");
  const pat = /(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+emissione:\s*(\d{2})-(\d{2})-(\d{4})\s+\d{2}:\d{2}\s+CEST\s+(.*?)temp\.\s*\(°C\)[^]*?costa\s+(\d{1,2})\/(\d{1,2})\s+(\d{1,2})\/(\d{1,2})/gi;
  const out = new Map<string, OsmerDay>();
  let m: RegExpExecArray | null;
  while ((m = pat.exec(txt)) !== null) {
    const [, , dd, mese, , emm, eyyyy, testo, cminA, cminB, cmaxA, cmaxB] = m;
    const monthTarget = MESI_IT[mese.toLowerCase()];
    let year = Number(eyyyy);
    if (monthTarget < Number(emm)) year += 1;
    const iso = `${year}-${String(monthTarget).padStart(2, "0")}-${String(Number(dd)).padStart(2, "0")}`;
    if (out.has(iso)) continue;
    const cleanText = testo.replace(/\s+/g, " ").trim().slice(0, 600);
    out.set(iso, {
      date: iso,
      coastTMin: (Number(cminA) + Number(cminB)) / 2,
      coastTMax: (Number(cmaxA) + Number(cmaxB)) / 2,
      text: cleanText,
    });
  }
  if (out.size === 0) throw new Error("OSMER: nessun bollettino estratto");
  return out;
}


/** Blend Open-Meteo + MET Norway: se disponibili entrambi, media pesata. */
function blendWeather(om: DailyWeather[], met: Map<string, { tMin: number; tMax: number; precipMm: number; windMax: number; cloudCover: number }>): DailyWeather[] {
  return om.map((d) => {
    const m = met.get(d.date);
    if (!m) return d;
    return {
      ...d,
      tMin: (d.tMin + m.tMin) / 2,
      tMax: (d.tMax + m.tMax) / 2,
      // Precipitazione: prendiamo il massimo tra i due modelli (approccio prudente)
      precipMm: Math.max(d.precipMm, m.precipMm),
      windMax: Math.max(d.windMax, m.windMax),
      cloudCover: d.cloudCover != null ? (d.cloudCover + m.cloudCover) / 2 : m.cloudCover,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Fallback stagionale
 * ------------------------------------------------------------------ */

function seasonalWeather(date: Date) {
  const m = date.getMonth() + 1;
  if (m === 7 || m === 8) return { tMin: 22, tMax: 31, precipProb: 20, windMax: 18, uvMax: 7.5, seaTemp: 25 };
  if (m === 6 || m === 9) return { tMin: 18, tMax: 27, precipProb: 25, windMax: 20, uvMax: 6, seaTemp: 22 };
  if (m === 5 || m === 10) return { tMin: 13, tMax: 22, precipProb: 30, windMax: 22, uvMax: 4, seaTemp: 18 };
  return { tMin: 6, tMax: 13, precipProb: 35, windMax: 24, uvMax: 2, seaTemp: 12 };
}

async function buildEmergencyFallback(): Promise<ForecastResponse> {
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  });
  const [signals, hist] = await Promise.all([loadSignals(dates), loadHistoricalStats()]);
  const days = dates.map((iso) => {
    const dt = new Date(iso + "T12:00:00");
    const seasonal = seasonalWeather(dt);
    const day: ForecastDay = {
      date: iso,
      weekday: WD[dt.getDay()],
      weatherCode: 3,
      tMin: seasonal.tMin,
      tMax: seasonal.tMax,
      precipMm: 0,
      precipProb: seasonal.precipProb,
      windMax: seasonal.windMax,
      uvMax: seasonal.uvMax,
      seaTemp: seasonal.seaTemp,
      bridge: detectBridge(iso, signals, dt),
      presence: 0,
      presenceReason: "Stima provvisoria su calendario, stagionalità e storico interventi",
    };
    const b = baselinePresence(day, dt, signals[iso], hist);
    day.presence = b.level;
    return day;
  });

  return {
    location: "Lignano Sabbiadoro",
    updatedAt: new Date().toISOString(),
    days,
    summary: "Provider meteo temporaneamente non disponibili: stima su calendario, stagionalità e storico interventi.",
    sources: [
      "Fallback locale — calendario, stagionalità e storico interventi",
      "OpenHolidays API — festività e vacanze scolastiche quando disponibili",
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Assemblaggio previsioni live
 * ------------------------------------------------------------------ */

async function fetchLiveForecast(): Promise<ForecastResponse> {
  // Fetch parallelo di tutte le fonti; ognuna può fallire indipendentemente.
  const [omRes, metRes, marineRes, osmerRes] = await Promise.allSettled([
    fetchOpenMeteo(),
    fetchMetNorway(),
    fetchMarine(),
    fetchOsmer(),
  ]);

  let om: DailyWeather[] | null = omRes.status === "fulfilled" ? omRes.value : null;
  const met = metRes.status === "fulfilled" ? metRes.value : null;
  const marine = marineRes.status === "fulfilled" ? marineRes.value : null;
  const osmer = osmerRes.status === "fulfilled" ? osmerRes.value : null;

  // Se Open-Meteo fallisce ma MET Norway funziona, costruiamo daily da MET Norway.
  if (!om && met) {
    om = Array.from(met.entries()).slice(0, 7).map(([iso, m]) => ({
      date: iso,
      weatherCode: m.cloudCover > 80 ? 3 : m.cloudCover > 40 ? 2 : m.precipMm > 5 ? 61 : 0,
      tMin: m.tMin,
      tMax: m.tMax,
      precipMm: m.precipMm,
      precipProb: m.precipMm > 2 ? 70 : m.precipMm > 0.2 ? 40 : 10,
      windMax: m.windMax,
      uvMax: 0,
      cloudCover: m.cloudCover,
    }));
  }
  if (!om) throw new Error("Nessuna fonte meteo disponibile");

  let blended = met ? blendWeather(om, met) : om;

  // OSMER è la fonte autorevole per la costa: sostituiamo tMin/tMax con la media
  // pesata a favore di OSMER (60/40) dove disponibile — Open-Meteo/MET usano lat/lon
  // generiche che possono cadere in mare, OSMER pubblica esplicitamente i valori costa.
  if (osmer) {
    blended = blended.map((d) => {
      const o = osmer.get(d.date);
      if (!o) return d;
      return {
        ...d,
        tMin: d.tMin * 0.4 + o.coastTMin * 0.6,
        tMax: d.tMax * 0.4 + o.coastTMax * 0.6,
      };
    });
  }

  const isoList = blended.map((x) => x.date);
  const [signals, hist] = await Promise.all([loadSignals(isoList), loadHistoricalStats()]);

  const perDayBase = new Map<string, { expected: number; ratio: number }>();
  const baseDays: ForecastDay[] = blended.map((w) => {
    const dt = new Date(w.date + "T12:00:00");
    const sig = signals[w.date];
    const mar = marine?.get(w.date);
    const day: ForecastDay = {
      date: w.date,
      weekday: WD[dt.getDay()],
      weatherCode: w.weatherCode,
      tMin: Math.round(w.tMin),
      tMax: Math.round(w.tMax),
      precipMm: Math.round(w.precipMm * 10) / 10,
      precipProb: Math.round(w.precipProb),
      windMax: Math.round(w.windMax),
      uvMax: Math.round(w.uvMax * 10) / 10,
      cloudCover: w.cloudCover != null ? Math.round(w.cloudCover) : undefined,
      sunshineHours: w.sunshineHours,
      seaTemp: mar ? Math.round(mar.seaTemp * 10) / 10 : undefined,
      waveMax: mar ? Math.round(mar.waveMax * 100) / 100 : undefined,
      bridge: detectBridge(w.date, signals, dt),
      presence: 0,
      presenceReason: "",
    };
    const b = baselinePresence(day, dt, sig, hist);
    day.presence = b.level;
    perDayBase.set(w.date, { expected: b.expected, ratio: b.ratio });
    return day;
  });

  let summary = "Stima automatica su meteo multi-modello, mare, calendario, OSMER e storico interventi.";
  try {
    const dowNames = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
    const prompt = JSON.stringify({
      localita: "Lignano Sabbiadoro",
      oggi: new Date().toISOString().slice(0, 10),
      note:
        "CALIBRAZIONE PRIMARIA: usa 'expected_interventi' e 'ratio_vs_max' — sono ricavati dal reale storico interventi (ultimi ~90 giorni, solo giorni aperti). Il livello DEVE riflettere la scala storica: ratio<0.28→0, <0.55→1, <0.85→2, else 3. Meteo/mare/OSMER/calendario servono a MODULARE dentro il livello atteso, non a sostituirlo. Non alzare mai di 2 livelli sopra il baseline_level a meno di festivo/ponte molto forte.",
      storico_interventi: {
        finestra_giorni: hist.windowDays,
        giorni_aperti_campionati: hist.openDays,
        massimo_giornaliero_osservato: hist.overallMax,
        media_per_giorno_settimana: dowNames.map((n, i) => ({
          giorno: n,
          media_interventi: Math.round(hist.dowAvg[i] * 10) / 10,
          giorni_campione: hist.dowSamples[i],
        })),
      },
      giorni: baseDays.map((x) => {
        const s = signals[x.date];
        const o = osmer?.get(x.date);
        const b = perDayBase.get(x.date);
        return {
          date: x.date,
          weekday: x.weekday,
          bridge: x.bridge ?? false,
          holidayIT: s?.holidayIT ?? null,
          holidayDE: s?.holidayDE ?? null,
          holidayAT: s?.holidayAT ?? null,
          schoolIT: Math.round((s?.schoolIT ?? 0) * 100) / 100,
          schoolDE: Math.round((s?.schoolDE ?? 0) * 100) / 100,
          schoolAT: Math.round((s?.schoolAT ?? 0) * 100) / 100,
          tMin: x.tMin,
          tMax: x.tMax,
          precipMm: x.precipMm,
          precipProb: x.precipProb,
          windMax: x.windMax,
          uv: x.uvMax,
          cloudCover: x.cloudCover ?? null,
          sunshineH: x.sunshineHours ?? null,
          seaTemp: x.seaTemp ?? null,
          waveMax: x.waveMax ?? null,
          baseline_level: x.presence,
          expected_interventi: b ? Math.round(b.expected * 10) / 10 : null,
          ratio_vs_max: b ? Math.round(b.ratio * 100) / 100 : null,
          osmerBollettino: o?.text ?? null,
          osmerCostaTmin: o?.coastTMin ?? null,
          osmerCostaTmax: o?.coastTMax ?? null,
        };
      }),
    });
    const raw = await callGateway(prompt);
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as {
      summary?: string;
      days?: { date: string; level: number; reason: string }[];
    };
    if (parsed.summary) summary = parsed.summary;
    if (Array.isArray(parsed.days)) {
      for (const p of parsed.days) {
        const target = baseDays.find((x) => x.date === p.date);
        if (!target) continue;
        const lv = Math.max(0, Math.min(3, Math.round(p.level))) as PresenceLevel;
        target.presence = lv;
        target.presenceReason = (p.reason ?? "").slice(0, 140);
      }
    }
  } catch {
    // Baseline euristica se l'AI fallisce.
  }

  const sources: string[] = [];
  if (osmerRes.status === "fulfilled") sources.push("OSMER ARPA FVG — bollettino ufficiale regionale (fonte esperta locale, prevalente sulla costa)");
  if (omRes.status === "fulfilled") sources.push("Open-Meteo — meteo multi-modello (best_match)");
  if (metRes.status === "fulfilled") sources.push("MET Norway (api.met.no) — modello atmosferico di riferimento");
  if (marineRes.status === "fulfilled") sources.push("Open-Meteo Marine — temperatura mare e onde");
  if (hist.openDays > 0) {
    sources.unshift(
      `Storico interventi punto Blu — ultimi ${hist.windowDays} giorni, ${hist.openDays} giorni aperti campionati (calibrazione principale della scala di affluenza)`,
    );
  }
  sources.push(
    "OpenHolidays API — festività pubbliche IT / DE / AT",
    "OpenHolidays API — vacanze scolastiche IT / DE / AT (per Länder/regione)",
    "Rilevamento ponti (festivo IT + weekend adiacente) e prossimità a Ferragosto",
    "Stima AI su storico interventi + meteo + mare + calendario + bollettino OSMER",
  );

  return {
    location: "Lignano Sabbiadoro",
    updatedAt: new Date().toISOString(),
    days: baseDays,
    summary,
    sources,
  };
}


export async function getForecastData(): Promise<ForecastResponse> {
  const fresh = await readCachedForecast(FRESH_CACHE_MS);
  if (fresh) return fresh;

  try {
    const live = await fetchLiveForecast();
    await writeCachedForecast(live);
    return live;
  } catch {
    const stale = await readCachedForecast(STALE_CACHE_MS);
    if (stale) return withStaleNotice(stale);
    const fallback = await buildEmergencyFallback();
    await writeCachedForecast(fallback);
    return fallback;
  }
}
