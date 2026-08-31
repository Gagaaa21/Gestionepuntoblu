import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiGateway } from "./ai-gateway.server";

async function assertSport(context: any) {
  const { data } = await context.supabase.rpc("has_sport_access", { _uid: context.userId });
  if (!data) throw new Error("Accesso non autorizzato ai Servizi sportivi");
}

async function callAI(content: any, opts?: { json?: boolean; model?: string }) {
  return callAiGateway([{ role: "user", content: typeof content === "string" ? content : JSON.stringify(content) }], {
    model: opts?.model ?? "google/gemini-2.5-flash",
    jsonMode: opts?.json,
  });
}


/* ---------------- Permesso (solo admin) ---------------- */

export const setSportPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; grant: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Solo gli admin possono concedere questo permesso");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_permissions").upsert({
      user_id: data.userId,
      can_manage_sport: data.grant,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Import AI da testo / file ---------------- */

export const parseSportServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text?: string; fileBase64?: string; filename?: string; mimeType?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSport(context);
    if (!data.text?.trim() && !data.fileBase64) throw new Error("Fornire testo o file");

    const schema = `{ "rows": [{ "event_date": "YYYY-MM-DD", "event_name": "", "start_time": "HH:MM", "end_time": "HH:MM", "location": "", "assets": [{ "type": "ambulanza"|"SAP"|"auto medica"|"altro", "vehicle_code": "M12", "crew": 3, "driver": "", "rescuers": "" }], "doctor_name": "", "meal_voucher": false, "als_backpack": false, "notes": "" }] }`;
    const instruction = `Sei un parser di servizi sportivi di un'associazione di soccorso (S.O.G.IT. Lignano).
Estrai TUTTI i servizi presenti nel contenuto e restituisci SOLO JSON valido con questo schema esatto: ${schema}.
REGOLE:
- Date italiane gg/mm/aaaa -> YYYY-MM-DD. Orari in HH:MM 24h.
- I mezzi hanno sigle tipo M12, M23, M30: mettile in vehicle_code (maiuscolo, senza spazi).
- "crew" = numero di persone dell'equipaggio (autista incluso). Se non indicato, usa 2.
- Se ci sono più mezzi (es. "2 ambulanze", "1 ambulanza + SAP") crea un elemento in assets per ciascun mezzo.
- "driver" = autista, "rescuers" = soccorritori separati da virgola.
- doctor_name solo se è indicato un medico.
- meal_voucher true se compare buono pasto/BP/pasto. als_backpack true se compare zaino ALS/ALS.
- Ignora intestazioni di tabella e totali. Restituisci SEMPRE {"rows":[...]}.`;

    const content: any[] = [{ type: "text", text: instruction }];
    if (data.text?.trim()) content.push({ type: "text", text: `Contenuto:\n\n${data.text}` });
    if (data.fileBase64) {
      content.push({
        type: "file",
        file: {
          filename: data.filename || "servizi.pdf",
          file_data: `data:${data.mimeType || "application/pdf"};base64,${data.fileBase64}`,
        },
      });
    }

    const out = await callAI(content, { json: true });
    try {
      const cleaned = out.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      const rows = Array.isArray(parsed?.rows) ? parsed.rows : Array.isArray(parsed) ? parsed : [];
      return { rows, raw: rows.length === 0 ? out.slice(0, 400) : undefined };
    } catch (e: any) {
      return { rows: [], raw: out.slice(0, 400), parseError: e?.message };
    }
  });

/* ---------------- Assistente AI mensile ---------------- */

export const sportInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; month: number }) => d)
  .handler(async ({ data, context }) => {
    await assertSport(context);
    const start = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    const endDate = new Date(Date.UTC(data.year, data.month, 1));
    const end = endDate.toISOString().slice(0, 10);

    const { data: rows } = await context.supabase
      .from("sport_services")
      .select("*")
      .gte("event_date", start)
      .lt("event_date", end)
      .order("event_date");
    const items = (rows ?? []) as any[];
    if (items.length === 0) return { text: "Nessun servizio registrato nel mese selezionato." };

    const compact = items.map((r) => ({
      d: r.event_date, n: r.event_name, h: `${r.start_time ?? "?"}-${r.end_time ?? "?"}`,
      loc: r.location, done: r.done, doc: r.doctor_name, bp: r.meal_voucher, als: r.als_backpack,
      assets: (r.assets ?? []).map((a: any) => `${a.type}:${a.vehicle_code || "?"} (${a.crew || "?"}p)`),
    }));
    const prompt = `Sei l'assistente operativo di una squadra di soccorso sportivo. Analizza i servizi del mese e rispondi in italiano con 4-6 righe puntate, concrete e sintetiche: carico di lavoro, mezzi più impiegati, eventuali sovrapposizioni orarie dello stesso mezzo, servizi ancora da svolgere, personale più coinvolto, eventuali dati mancanti da completare. Dati: ${JSON.stringify(compact)}`;
    const text = await callAI(prompt);
    return { text: text || "Analisi non disponibile." };
  });

/* ---------------- Assistente conversazionale ---------------- */

export const sportAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { question: string; year: number; month: number; allYear?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertSport(context);
    if (!data.question?.trim()) throw new Error("Domanda mancante");
    const start = data.allYear ? `${data.year}-01-01` : `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    const end = data.allYear
      ? `${data.year + 1}-01-01`
      : new Date(Date.UTC(data.year, data.month, 1)).toISOString().slice(0, 10);

    const [{ data: rows }, { data: veh }] = await Promise.all([
      context.supabase.from("sport_services").select("*").gte("event_date", start).lt("event_date", end).order("event_date"),
      context.supabase.from("sport_vehicles").select("code,label,out_of_service,oos_from,oos_to,oos_reason"),
    ]);
    const items = (rows ?? []) as any[];
    const compact = items.map((r) => ({
      d: r.event_date, n: r.event_name, h: `${r.start_time ?? "?"}-${r.end_time ?? "?"}`, loc: r.location,
      done: r.done, paid: r.paid, doc: r.doctor_name, bp: r.meal_voucher, als: r.als_backpack, note: r.notes,
      assets: (r.assets ?? []).map((a: any) => ({
        t: a.type, v: a.vehicle_code, p: a.crew, drv: a.driver, res: a.rescuers, h: `${a.start_time ?? ""}-${a.end_time ?? ""}`,
      })),
      changes: (r.crew_changes ?? []).map((c: any) => ({ t: c.time, to: c.end_time, k: c.kind, v: c.vehicle_code, drv: c.driver, res: c.rescuers })),
    }));

    const prompt = `Sei l'assistente operativo dei servizi sportivi di S.O.G.IT. Lignano.
Rispondi in italiano, in modo breve e concreto, usando SOLO i dati forniti. Se un dato manca, dillo esplicitamente.
Puoi fare conteggi, confronti, individuare sovrapposizioni di mezzi e turni scoperti, e suggerire l'organizzazione degli equipaggi.
Formatta con righe puntate quando aiuta la lettura.

VEICOLI: ${JSON.stringify(veh ?? [])}
SERVIZI (${start} → ${end}): ${JSON.stringify(compact)}

DOMANDA: ${data.question}`;
    const text = await callAI(prompt);
    return { text: text || "Nessuna risposta disponibile." };
  });

/* ---------------- Suggerimento equipaggi ---------------- */

export const sportCrewSuggest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { event_date: string; start_time?: string | null; end_time?: string | null; event_name?: string; assets: any[] }) => d)
  .handler(async ({ data, context }) => {
    await assertSport(context);
    const { data: rows } = await context.supabase
      .from("sport_services")
      .select("event_date,event_name,start_time,end_time,assets,crew_changes")
      .order("event_date", { ascending: false })
      .limit(120);
    const history = (rows ?? []).map((r: any) => ({
      d: r.event_date, n: r.event_name, h: `${r.start_time ?? "?"}-${r.end_time ?? "?"}`,
      a: (r.assets ?? []).map((x: any) => ({ v: x.vehicle_code, drv: x.driver, res: x.rescuers, p: x.crew })),
    }));
    const prompt = `Sei l'assistente di pianificazione di S.O.G.IT. Lignano.
In base allo storico dei servizi, proponi gli equipaggi per il nuovo servizio.
Restituisci SOLO JSON: {"assets":[{"vehicle_code":"","crew":2,"driver":"","rescuers":""}],"reason":"breve motivazione"}
Regole: usa solo nomi presenti nello storico; distribuisci il carico evitando persone già molto impiegate; non assegnare la stessa persona a due mezzi contemporaneamente; rescuers separati da virgola.

STORICO: ${JSON.stringify(history)}
NUOVO SERVIZIO: ${JSON.stringify({ date: data.event_date, name: data.event_name, from: data.start_time, to: data.end_time, assets: data.assets })}`;
    const out = await callAI(prompt, { json: true });
    try {
      const cleaned = out.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      return { assets: Array.isArray(parsed?.assets) ? parsed.assets : [], reason: String(parsed?.reason ?? "") };
    } catch {
      return { assets: [], reason: out.slice(0, 300) };
    }
  });
