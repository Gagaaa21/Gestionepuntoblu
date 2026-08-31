import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiGateway, type ChatMessage } from "./ai-gateway.server";
import { z } from "zod";

const MODEL = "google/gemini-2.5-flash";

async function callGateway(messages: ChatMessage[], opts?: { temperature?: number; jsonMode?: boolean }) {
  return callAiGateway(messages, { model: MODEL, temperature: opts?.temperature ?? 0.3, jsonMode: opts?.jsonMode });
}


function parseJsonLoose<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to find a JSON object/array in the response
    const m = raw.match(/[\{\[][\s\S]*[\}\]]/);
    if (m) {
      try { return JSON.parse(m[0]) as T; } catch { return null; }
    }
    return null;
  }
}

/* ============================================================
   BRIEFING INTELLIGENTE — predizione + anomalie + suggerimenti
   ============================================================ */

export type IntelligenceBriefing = {
  generated_at: string;
  today_date: string; // ISO date
  prediction: {
    expected_today: number;
    band_low: number;
    band_high: number;
    trend_pct: number; // vs media 2 settimane precedenti, es. +12
    driver: string;
  };
  headline: string;
  anomalies: Array<{ severity: "info" | "warn" | "alert"; text: string }>;
  highlights: string[];
  patient_flags: Array<{ patient_id: string; label: string; reason: string }>;
};

function romeDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export const dailyBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntelligenceBriefing> => {
    const supabase = context.supabase;
    const now = new Date();
    const today = romeDate(now);
    const since28 = new Date(now.getTime() - 28 * 86400000);

    const { data: rows, error } = await supabase
      .from("interventions")
      .select("id, patient_id, intervention_type, intervention_date, invio_in_ppi, fuori_sede, notes, operator_username, vs_pas, vs_pad, vs_fc, vs_spo2, vs_temp, vs_glicemia")
      .gte("intervention_date", since28.toISOString())
      .order("intervention_date", { ascending: false })
      .limit(2000);
    if (error) throw new Error("Errore caricamento interventi.");
    const list = rows ?? [];

    // === Aggregazioni server-side ===
    const dayCounts = new Map<string, number>(); // YYYY-MM-DD -> n
    const byType = new Map<string, number>();
    const byWeekday = new Array(7).fill(0) as number[];
    const byOperator = new Map<string, number>();
    let ppi = 0, fuori = 0;

    const patientMap = new Map<string, {
      count: number;
      ppi: number;
      lastDate: string;
      criticalVitals: string[];
    }>();

    const critical = (v: {
      vs_pas?: number | null; vs_pad?: number | null; vs_fc?: number | null;
      vs_spo2?: number | null; vs_temp?: number | null; vs_glicemia?: number | null;
    }): string[] => {
      const out: string[] = [];
      if (v.vs_pas != null && (v.vs_pas >= 180 || v.vs_pas <= 90)) out.push(`PAS ${v.vs_pas}`);
      if (v.vs_pad != null && (v.vs_pad >= 110 || v.vs_pad <= 55)) out.push(`PAD ${v.vs_pad}`);
      if (v.vs_fc != null && (v.vs_fc >= 130 || v.vs_fc <= 45)) out.push(`FC ${v.vs_fc}`);
      if (v.vs_spo2 != null && v.vs_spo2 <= 92) out.push(`SpO2 ${v.vs_spo2}%`);
      if (v.vs_temp != null && (v.vs_temp >= 38.5 || v.vs_temp <= 35)) out.push(`T ${v.vs_temp}°`);
      if (v.vs_glicemia != null && (v.vs_glicemia >= 300 || v.vs_glicemia <= 55)) out.push(`glic ${v.vs_glicemia}`);
      return out;
    };

    for (const i of list) {
      const day = (i.intervention_date ?? "").slice(0, 10);
      if (day) dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      byType.set(i.intervention_type, (byType.get(i.intervention_type) ?? 0) + 1);
      const wd = (new Date(i.intervention_date).getDay() + 6) % 7;
      byWeekday[wd]++;
      if (i.invio_in_ppi) ppi++;
      if (i.fuori_sede) fuori++;
      if (i.operator_username) byOperator.set(i.operator_username, (byOperator.get(i.operator_username) ?? 0) + 1);
      if (i.patient_id) {
        const p = patientMap.get(i.patient_id) ?? { count: 0, ppi: 0, lastDate: day, criticalVitals: [] };
        p.count++;
        if (i.invio_in_ppi) p.ppi++;
        if (day > p.lastDate) p.lastDate = day;
        const crits = critical(i);
        if (crits.length) p.criticalVitals.push(...crits);
        patientMap.set(i.patient_id, p);
      }
    }

    // last 4 weeks vs previous 4 weeks
    const dayOfWeek = (now.getDay() + 6) % 7; // 0=Lun
    let last2 = 0, prev2 = 0;
    for (let d = 0; d < 14; d++) last2 += dayCounts.get(dayForOffset(now, d)) ?? 0;
    for (let d = 14; d < 28; d++) prev2 += dayCounts.get(dayForOffset(now, d)) ?? 0;
    const avgPerDay14 = last2 / 14;
    const weekdayAvg = byWeekday[dayOfWeek] / 4; // 4 sample weekdays in 28gg
    const expected = Math.max(0, Math.round(weekdayAvg));
    const band_low = Math.max(0, Math.round(expected * 0.7));
    const band_high = Math.round(expected * 1.35 + 1);
    const trendPct = prev2 > 0 ? Math.round(((last2 - prev2) / prev2) * 100) : 0;

    const wdNames = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];

    // Anomalie automatiche server-side (deterministiche)
    const localAnomalies: Array<{ severity: "info"|"warn"|"alert"; text: string }> = [];
    if (trendPct >= 25) localAnomalies.push({ severity: "warn", text: `Attività in aumento del ${trendPct}% rispetto alle 2 settimane precedenti.` });
    if (trendPct <= -25) localAnomalies.push({ severity: "warn", text: `Attività in calo del ${Math.abs(trendPct)}% rispetto alle 2 settimane precedenti.` });
    const todayCount = dayCounts.get(today) ?? 0;
    if (todayCount > expected * 1.8 && todayCount >= 6) localAnomalies.push({ severity: "alert", text: `Oggi ${todayCount} interventi: molto sopra la media (${expected} attesi).` });
    const ppiRate = list.length ? ppi / list.length : 0;
    if (ppiRate > 0.15) localAnomalies.push({ severity: "warn", text: `Tasso di invio in PPI elevato: ${Math.round(ppiRate * 100)}% negli ultimi 28 giorni.` });

    // Pazienti "da tenere d'occhio"
    const patientFlags: IntelligenceBriefing["patient_flags"] = [];
    for (const [pid, p] of patientMap.entries()) {
      if (p.count >= 4) {
        patientFlags.push({ patient_id: pid, label: `${p.count} interventi`, reason: `${p.count} interventi negli ultimi 28gg (ultimo ${p.lastDate}).` });
      } else if (p.ppi >= 2) {
        patientFlags.push({ patient_id: pid, label: `${p.ppi} invii in PPI`, reason: `${p.ppi} invii in PPI ravvicinati.` });
      } else if (p.criticalVitals.length >= 2) {
        patientFlags.push({ patient_id: pid, label: `parametri critici`, reason: `Rilevati parametri fuori range: ${[...new Set(p.criticalVitals)].slice(0,3).join(", ")}.` });
      }
    }
    // arricchisci con nomi
    const flagIds = patientFlags.slice(0, 8).map((f) => f.patient_id);
    let nameMap = new Map<string, string>();
    if (flagIds.length) {
      const { data: pRows } = await supabase.from("patients").select("id, first_name, last_name").in("id", flagIds);
      nameMap = new Map((pRows ?? []).map((p) => [p.id, `${p.last_name} ${p.first_name}`.trim()]));
    }
    const enrichedFlags = patientFlags.slice(0, 6).map((f) => ({
      ...f,
      label: `${nameMap.get(f.patient_id) ?? "Paziente"} — ${f.label}`,
    }));

    // Chiama AI per headline + arricchimento anomalie
    const topTypes = [...byType.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
    const topOps = [...byOperator.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
    const promptData = {
      oggi: today,
      giorno_settimana: wdNames[dayOfWeek],
      totale_28gg: list.length,
      ultime_2_settimane: last2,
      precedenti_2_settimane: prev2,
      variazione_pct: trendPct,
      media_per_giorno: Number(avgPerDay14.toFixed(2)),
      attesi_oggi: expected,
      banda_oggi: [band_low, band_high],
      per_giorno_settimana: wdNames.map((n,i)=>({ giorno: n, media: Number((byWeekday[i]/4).toFixed(1)), totale: byWeekday[i] })),
      top_tipi: topTypes.map(([n,c])=>({ nome:n, count:c })),
      top_operatori: topOps.map(([n,c])=>({ operatore:n, count:c })),
      invii_ppi_28gg: ppi,
      fuori_sede_28gg: fuori,
      anomalie_gia_rilevate: localAnomalies,
      pazienti_da_seguire: enrichedFlags.map(f=>({ id: f.patient_id, motivo: f.reason })),
    };

    const raw = await callGateway([
      {
        role: "system",
        content:
          "Sei l'assistente intelligente di un ambulatorio Punto Blu di Lignano. In italiano, dai un briefing giornaliero al team. " +
          "Non inventare dati o diagnosi. Non dare consigli medici clinici. Usa SOLO i dati forniti. " +
          "Rispondi ESATTAMENTE con questo JSON, senza testo attorno:\n" +
          `{\n  "headline": "una frase, max 22 parole, tono professionale e utile",\n  "highlights": ["2-3 osservazioni brevi (max 18 parole) su pattern positivi/neutri concreti"],\n  "anomalie_extra": ["opzionale: 0-2 anomalie aggiuntive non già presenti in anomalie_gia_rilevate, come stringhe brevi"]\n}`,
      },
      { role: "user", content: JSON.stringify(promptData) },
    ], { jsonMode: true });

    type AiOut = { headline?: string; highlights?: string[]; anomalie_extra?: string[] };
    const ai = parseJsonLoose<AiOut>(raw) ?? {};
    const headline = (ai.headline || "").toString().trim() || `Oggi previsti circa ${expected} interventi (banda ${band_low}–${band_high}).`;
    const highlights = Array.isArray(ai.highlights) ? ai.highlights.filter((s): s is string => typeof s === "string").slice(0, 3) : [];
    const extraAnoms = Array.isArray(ai.anomalie_extra) ? ai.anomalie_extra.filter((s): s is string => typeof s === "string").slice(0, 2) : [];
    const anomalies = [
      ...localAnomalies,
      ...extraAnoms.map((t) => ({ severity: "info" as const, text: t })),
    ];

    // Driver semplice
    const isWeekend = dayOfWeek >= 5;
    const driver = isWeekend
      ? "weekend, tipicamente affluenza turistica più alta"
      : trendPct >= 15 ? "trend in crescita nelle ultime settimane"
      : trendPct <= -15 ? "trend in calo nelle ultime settimane"
      : "media stabile per questo giorno della settimana";

    return {
      generated_at: new Date().toISOString(),
      today_date: today,
      prediction: { expected_today: expected, band_low, band_high, trend_pct: trendPct, driver },
      headline,
      anomalies,
      highlights,
      patient_flags: enrichedFlags,
    };
  });

function dayForOffset(base: Date, offsetDays: number): string {
  const d = new Date(base.getTime() - offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/* ============================================================
   RICERCA SEMANTICA — NL → filtri → risultati
   ============================================================ */

const semanticInput = z.object({ query: z.string().min(2).max(300) });

export type SemanticSearchResult = {
  understood: string; // spiegazione umana della query
  filters: {
    text?: string;
    types?: string[];
    date_from?: string;
    date_to?: string;
    ppi?: boolean;
    fuori_sede?: boolean;
    only_critical?: boolean;
  };
  patients: Array<{ id: string; name: string }>;
  interventions: Array<{ id: string; date: string; type: string; patient?: string; ppi: boolean; fuori: boolean }>;
};

export const semanticQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => semanticInput.parse(d))
  .handler(async ({ data, context }): Promise<SemanticSearchResult> => {
    const supabase = context.supabase;

    // Chiedi al modello di trasformare la query in filtri strutturati
    const todayIso = romeDate(new Date());
    const raw = await callGateway([
      {
        role: "system",
        content:
          "Traduci una query in linguaggio naturale (italiano) in filtri JSON per una ricerca in un archivio clinico ambulatorio. " +
          "Rispondi SOLO con JSON valido, senza testo extra. Schema:\n" +
          `{\n  "understood": "riformula la richiesta in una frase breve",\n  "text": "termine libero per nome paziente o parole nelle note, opzionale",\n  "types": ["parole chiave del tipo di intervento, opzionale"],\n  "date_from": "YYYY-MM-DD opzionale",\n  "date_to": "YYYY-MM-DD opzionale",\n  "ppi": true|false|null,\n  "fuori_sede": true|false|null,\n  "only_critical": true|false\n}\n` +
          `Oggi è ${todayIso}. Interpreta espressioni come "questa settimana", "luglio", "ultimi 3 mesi", "oggi", "fuori sede", "in ambulanza", "gravi", "critici", "parametri anomali" (=only_critical true), "PPI"/"pronto soccorso" (=ppi true). Se non sei sicuro, lascia il campo assente o null.`,
      },
      { role: "user", content: data.query },
    ], { jsonMode: true, temperature: 0.1 });

    type Filt = {
      understood?: string;
      text?: string; types?: string[];
      date_from?: string; date_to?: string;
      ppi?: boolean | null; fuori_sede?: boolean | null;
      only_critical?: boolean;
    };
    const parsed = parseJsonLoose<Filt>(raw) ?? {};

    const filters = {
      text: parsed.text?.trim() || undefined,
      types: (parsed.types ?? []).filter((t) => typeof t === "string" && t.trim().length > 0),
      date_from: parsed.date_from || undefined,
      date_to: parsed.date_to || undefined,
      ppi: parsed.ppi === true ? true : parsed.ppi === false ? false : undefined,
      fuori_sede: parsed.fuori_sede === true ? true : parsed.fuori_sede === false ? false : undefined,
      only_critical: parsed.only_critical === true || undefined,
    };

    // === Query pazienti ===
    let patients: SemanticSearchResult["patients"] = [];
    if (filters.text) {
      const term = filters.text.replace(/[%_]/g, "");
      const { data: pRows } = await supabase
        .from("patients")
        .select("id, first_name, last_name")
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
        .limit(20);
      patients = (pRows ?? []).map((p) => ({ id: p.id, name: `${p.last_name} ${p.first_name}`.trim() }));
    }

    // === Query interventi ===
    let q = supabase
      .from("interventions")
      .select("id, intervention_type, intervention_date, invio_in_ppi, fuori_sede, notes, vs_pas, vs_pad, vs_fc, vs_spo2, vs_temp, vs_glicemia, patient_id")
      .order("intervention_date", { ascending: false })
      .limit(50);

    if (filters.date_from) q = q.gte("intervention_date", filters.date_from);
    if (filters.date_to) q = q.lte("intervention_date", `${filters.date_to}T23:59:59`);
    if (filters.ppi === true) q = q.eq("invio_in_ppi", true);
    if (filters.ppi === false) q = q.eq("invio_in_ppi", false);
    if (filters.fuori_sede === true) q = q.eq("fuori_sede", true);
    if (filters.fuori_sede === false) q = q.eq("fuori_sede", false);
    if (filters.types && filters.types.length) {
      const ors = filters.types.map((t) => `intervention_type.ilike.%${t.replace(/[%_]/g, "")}%`).join(",");
      q = q.or(ors);
    }
    if (filters.text) {
      const term = filters.text.replace(/[%_]/g, "");
      q = q.or(`notes.ilike.%${term}%,operator_username.ilike.%${term}%`);
    }

    const { data: iRows } = await q;
    let interventions = iRows ?? [];

    if (filters.only_critical) {
      interventions = interventions.filter((i) => {
        return (i.vs_pas != null && (i.vs_pas >= 180 || i.vs_pas <= 90))
          || (i.vs_pad != null && (i.vs_pad >= 110 || i.vs_pad <= 55))
          || (i.vs_fc != null && (i.vs_fc >= 130 || i.vs_fc <= 45))
          || (i.vs_spo2 != null && i.vs_spo2 <= 92)
          || (i.vs_temp != null && (i.vs_temp >= 38.5 || i.vs_temp <= 35))
          || (i.vs_glicemia != null && (i.vs_glicemia >= 300 || i.vs_glicemia <= 55));
      });
    }

    // arricchimento nome paziente
    const pids = [...new Set(interventions.map((i) => i.patient_id).filter((v): v is string => !!v))].slice(0, 100);
    let patientNames = new Map<string, string>();
    if (pids.length) {
      const { data: pr } = await supabase.from("patients").select("id, first_name, last_name").in("id", pids);
      patientNames = new Map((pr ?? []).map((p) => [p.id, `${p.last_name} ${p.first_name}`.trim()]));
    }

    return {
      understood: (parsed.understood || "").toString().trim() || `Ricerca: ${data.query}`,
      filters,
      patients,
      interventions: interventions.slice(0, 30).map((i) => ({
        id: i.id,
        date: (i.intervention_date ?? "").slice(0, 10),
        type: i.intervention_type,
        patient: i.patient_id ? patientNames.get(i.patient_id) : undefined,
        ppi: !!i.invio_in_ppi,
        fuori: !!i.fuori_sede,
      })),
    };
  });
