import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiGateway, type ChatMessage } from "./ai-gateway.server";
import { z } from "zod";

const MODEL_FAST = "google/gemini-2.5-flash";

async function callGateway(messages: ChatMessage[], opts?: { model?: string; temperature?: number }) {
  return callAiGateway(messages, { model: opts?.model ?? MODEL_FAST, temperature: opts?.temperature ?? 0.4 });
}


/* -------------------------------- Summarize a patient -------------------------------- */

const summarizePatientInput = z.object({ patientId: z.string().uuid() });

export const summarizePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => summarizePatientInput.parse(data))
  .handler(async ({ data, context }) => {
    const { patientId } = data;
    const supabase = context.supabase;

    const { data: patient, error: pErr } = await supabase
      .from("patients")
      .select("id, first_name, last_name, notes, created_at")
      .eq("id", patientId)
      .maybeSingle();
    if (pErr || !patient) throw new Error("Paziente non trovato.");

    const { data: interventions, error: iErr } = await supabase
      .from("interventions")
      .select("intervention_type, intervention_date, invio_in_ppi, fuori_sede, notes, operator_username, vs_pas, vs_pad, vs_fc, vs_spo2, vs_temp, vs_glicemia, vitals_timeline, extra_data")
      .eq("patient_id", patientId)
      .order("intervention_date", { ascending: false })
      .limit(200);
    if (iErr) throw new Error("Errore nel caricamento interventi.");

    const list = interventions ?? [];
    if (list.length === 0) {
      return { summary: "Nessun intervento registrato per questo paziente.", count: 0 };
    }

    /* ---------- Analisi deterministica lato server (niente allucinazioni) ---------- */
    type Num = number | null | undefined;
    const nums = (k: "vs_pas" | "vs_pad" | "vs_fc" | "vs_spo2" | "vs_temp" | "vs_glicemia") =>
      list.map((i) => i[k] as Num).filter((v): v is number => typeof v === "number");

    const stat = (arr: number[]) => arr.length
      ? {
          n: arr.length,
          min: Math.min(...arr),
          max: Math.max(...arr),
          media: Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)),
          ultimo: arr[0],
        }
      : null;

    // arr è ordinato dal più recente: confronto ultime 3 rilevazioni vs precedenti
    const trend = (arr: number[]) => {
      if (arr.length < 4) return "dati insufficienti";
      const recent = arr.slice(0, 3);
      const past = arr.slice(3);
      const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      const d = avg(recent) - avg(past);
      const rel = Math.abs(d) / Math.max(1, Math.abs(avg(past)));
      if (rel < 0.05) return "stabile";
      return d > 0 ? `in aumento (+${d.toFixed(1)})` : `in calo (${d.toFixed(1)})`;
    };

    const vitalsSummary = {
      PA_sistolica: { ...(stat(nums("vs_pas")) ?? {}), andamento: trend(nums("vs_pas")) },
      PA_diastolica: { ...(stat(nums("vs_pad")) ?? {}), andamento: trend(nums("vs_pad")) },
      FC: { ...(stat(nums("vs_fc")) ?? {}), andamento: trend(nums("vs_fc")) },
      SpO2: { ...(stat(nums("vs_spo2")) ?? {}), andamento: trend(nums("vs_spo2")) },
      Temperatura: { ...(stat(nums("vs_temp")) ?? {}), andamento: trend(nums("vs_temp")) },
      Glicemia: { ...(stat(nums("vs_glicemia")) ?? {}), andamento: trend(nums("vs_glicemia")) },
    };

    const isCritical = (i: (typeof list)[number]) =>
      (i.vs_pas != null && (i.vs_pas >= 180 || i.vs_pas <= 90)) ||
      (i.vs_pad != null && (i.vs_pad >= 110 || i.vs_pad <= 55)) ||
      (i.vs_fc != null && (i.vs_fc >= 130 || i.vs_fc <= 45)) ||
      (i.vs_spo2 != null && i.vs_spo2 <= 92) ||
      (i.vs_temp != null && (i.vs_temp >= 38.5 || i.vs_temp <= 35)) ||
      (i.vs_glicemia != null && (i.vs_glicemia >= 300 || i.vs_glicemia <= 55));

    const criticalEpisodes = list.filter(isCritical).slice(0, 10).map((i) => ({
      data: i.intervention_date?.slice(0, 10),
      evento: i.intervention_type,
      parametri: [
        i.vs_pas != null || i.vs_pad != null ? `PA ${i.vs_pas ?? "?"}/${i.vs_pad ?? "?"}` : null,
        i.vs_fc != null ? `FC ${i.vs_fc}` : null,
        i.vs_spo2 != null ? `SpO2 ${i.vs_spo2}%` : null,
        i.vs_temp != null ? `T ${i.vs_temp}` : null,
        i.vs_glicemia != null ? `glic ${i.vs_glicemia}` : null,
      ].filter(Boolean).join(" "),
      ppi: !!i.invio_in_ppi,
    }));

    const byType = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const i of list) {
      byType.set(i.intervention_type, (byType.get(i.intervention_type) ?? 0) + 1);
      const m = (i.intervention_date ?? "").slice(0, 7);
      if (m) byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
    }

    // Intervallo medio fra interventi (giorni)
    const times = list
      .map((i) => new Date(i.intervention_date).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => b - a);
    let avgGap: number | null = null;
    if (times.length >= 2) {
      let tot = 0;
      for (let k = 0; k < times.length - 1; k++) tot += times[k] - times[k + 1];
      avgGap = Math.round(tot / (times.length - 1) / 86400000);
    }
    const daysSinceLast = times.length ? Math.floor((Date.now() - times[0]) / 86400000) : null;
    const last12m = list.filter((i) => Date.now() - new Date(i.intervention_date).getTime() <= 365 * 86400000).length;

    const dossier = {
      paziente: `${patient.last_name} ${patient.first_name}`,
      note_anagrafica: patient.notes ?? null,
      totale_interventi: list.length,
      interventi_ultimi_12_mesi: last12m,
      primo_intervento: list[list.length - 1]?.intervention_date?.slice(0, 10) ?? null,
      ultimo_intervento: list[0]?.intervention_date?.slice(0, 10) ?? null,
      giorni_dall_ultimo: daysSinceLast,
      intervallo_medio_giorni: avgGap,
      invii_ppi: list.filter((i) => i.invio_in_ppi).length,
      fuori_sede: list.filter((i) => i.fuori_sede).length,
      eventi_per_tipo: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([nome, count]) => ({ nome, count })),
      distribuzione_mensile: [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([mese, count]) => ({ mese, count })),
      parametri_vitali: vitalsSummary,
      episodi_con_parametri_fuori_range: criticalEpisodes,
      numero_episodi_critici: list.filter(isCritical).length,
      note_interventi: list
        .filter((i) => i.notes)
        .slice(0, 25)
        .map((i) => `${i.intervention_date?.slice(0, 10)} · ${i.intervention_type}: ${String(i.notes).slice(0, 220)}`),
      cronologia: list.slice(0, 40).map((i) => ({
        data: i.intervention_date?.slice(0, 10),
        evento: i.intervention_type,
        ppi: !!i.invio_in_ppi,
        fuori_sede: !!i.fuori_sede,
        pa: i.vs_pas != null || i.vs_pad != null ? `${i.vs_pas ?? "?"}/${i.vs_pad ?? "?"}` : null,
        fc: i.vs_fc, spo2: i.vs_spo2, temp: i.vs_temp, glicemia: i.vs_glicemia,
        operatore: i.operator_username,
      })),
    };

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Sei l'assistente clinico-documentale di un ambulatorio italiano (S.O.G.IT. Punto Blu). Ricevi un dossier JSON già aggregato di un paziente e produci un BRIEFING APPROFONDITO in italiano per l'operatore che lo sta per vedere.\n" +
          "REGOLE: usa esclusivamente i dati del dossier; non inventare diagnosi, terapie o consigli medici; se un dato manca scrivi 'non disponibile'; cita sempre numeri e date concrete.\n" +
          "FORMATO (markdown semplice, niente tabelle, niente introduzioni):\n" +
          "**Quadro generale**\n- 2-3 bullet: quante volte è stato assistito, da quando, ogni quanto in media, quando l'ultima volta.\n" +
          "**Motivi ricorrenti**\n- 2-4 bullet: eventi più frequenti con conteggi, eventuale stagionalità o concentrazione temporale.\n" +
          "**Parametri vitali**\n- 2-4 bullet: valori medi/min/max e andamento (stabile, in aumento, in calo) dei parametri disponibili; segnala esplicitamente i valori fuori range e la data.\n" +
          "**Segnali di attenzione**\n- 1-4 bullet: invii in PPI, episodi critici, interventi ravvicinati, note ricorrenti (allergie, terapie citate, condizioni riportate). Se non ce ne sono, scrivi un bullet 'Nessun segnale rilevante dai dati'.\n" +
          "**Da tenere presente oggi**\n- 2-3 bullet operativi e concreti su cosa verificare o rilevare, derivati SOLO dai dati (es. 'ricontrollare PA: ultime 3 misurazioni sopra 160').\n" +
          "Chiudi con una riga vuota e una singola frase di sintesi (max 25 parole).",
      },
      { role: "user", content: JSON.stringify(dossier) },
    ];

    const summary = await callGateway(messages, { temperature: 0.25 });
    return {
      summary,
      count: list.length,
      stats: {
        total: list.length,
        last12m,
        ppi: dossier.invii_ppi,
        critical: dossier.numero_episodi_critici,
        avgGap,
        daysSinceLast,
      },
    };
  });

/* -------------------------------- Weekly insights (dashboard) -------------------------------- */

export const weeklyInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const since = new Date();
    since.setDate(since.getDate() - 28); // 4 weeks for comparison

    const { data: rows, error } = await supabase
      .from("interventions")
      .select("intervention_type, intervention_date, invio_in_ppi, fuori_sede, operator_username")
      .gte("intervention_date", since.toISOString())
      .order("intervention_date", { ascending: false });
    if (error) throw new Error("Errore nel caricamento interventi.");

    const list = rows ?? [];
    if (list.length === 0) {
      return { insights: ["Nessun intervento registrato nelle ultime 4 settimane."] };
    }

    // Aggregate quickly on server for a compact prompt.
    const byWeek = new Map<number, number>(); // 0 = corrente, 1 = -1w, ...
    const byType = new Map<string, number>();
    const byWeekday = new Array(7).fill(0) as number[];
    let ppi = 0, fuori = 0;
    const now = Date.now();
    for (const i of list) {
      const t = new Date(i.intervention_date).getTime();
      const week = Math.floor((now - t) / (7 * 86400000));
      if (week >= 0 && week < 4) byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
      byType.set(i.intervention_type, (byType.get(i.intervention_type) ?? 0) + 1);
      const wd = (new Date(i.intervention_date).getDay() + 6) % 7;
      byWeekday[wd]++;
      if (i.invio_in_ppi) ppi++;
      if (i.fuori_sede) fuori++;
    }
    const topTypes = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const wdNames = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Sei un assistente che genera insight operativi in italiano per un ambulatorio. " +
          "Rispondi SOLO con un array JSON di 2-3 stringhe, ognuna una singola frase corta (max 22 parole) con un'osservazione concreta e utile basata sui dati forniti. " +
          "Niente diagnosi, niente consigli medici. Includi almeno un confronto tra le settimane e un pattern (giorno/tipo). Nessun testo extra fuori dal JSON.",
      },
      {
        role: "user",
        content: JSON.stringify({
          settimana_corrente: byWeek.get(0) ?? 0,
          settimana_meno1: byWeek.get(1) ?? 0,
          settimana_meno2: byWeek.get(2) ?? 0,
          settimana_meno3: byWeek.get(3) ?? 0,
          totale_28gg: list.length,
          invii_ppi: ppi,
          fuori_sede: fuori,
          top_tipi: topTypes.map(([name, count]) => ({ name, count })),
          per_giorno_settimana: wdNames.map((n, i) => ({ giorno: n, count: byWeekday[i] })),
        }),
      },
    ];

    const raw = await callGateway(messages, { temperature: 0.3 });
    // Try parse JSON — if the model wrapped it in backticks, strip them.
    let parsed: string[] = [];
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const j = JSON.parse(cleaned);
      if (Array.isArray(j)) parsed = j.filter((s: unknown) => typeof s === "string").slice(0, 3);
    } catch {
      // Fallback: split on newlines
      parsed = raw.split(/\n+/).map((s) => s.replace(/^[-*•\d.\s)]+/, "").trim()).filter(Boolean).slice(0, 3);
    }
    if (parsed.length === 0) parsed = [raw.slice(0, 200)];
    return { insights: parsed };
  });
