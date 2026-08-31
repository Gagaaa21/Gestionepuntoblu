import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertTransportsAccess } from "./transports.server";
import { AI_GATEWAY_URL, aiAuthHeaders, getAiApiKey } from "./ai-config.server";

export const setTransportsPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), grant: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Solo gli admin possono concedere questo permesso");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_permissions").upsert({
      user_id: data.userId,
      can_manage_transports: data.grant,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTransportsAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertTransportsAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_permissions")
      .select("user_id, can_manage_transports");
    return { ids: ((data ?? []) as any[]).filter((p) => p.can_manage_transports).map((p) => p.user_id) };
  });

// AI Insight sui trasporti del mese
export const transportsInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertTransportsAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const start = new Date(Date.UTC(data.year, data.month - 1, 1)).toISOString();
    const end = new Date(Date.UTC(data.year, data.month, 1)).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("secondary_transports")
      .select("*")
      .gte("transport_date", start)
      .lt("transport_date", end);
    const items = (rows ?? []) as any[];
    if (items.length === 0) {
      return { text: "Nessun trasporto registrato nel periodo selezionato.", kpis: null };
    }
    const totKm = items.reduce((s, r) => s + Number(r.kilometers || 0), 0);
    const totPrice = items.reduce((s, r) => s + Number(r.price || 0), 0);
    const totSosta = items.reduce((s, r) => s + Number(r.sosta_hours || 0), 0);
    const totSostaPrice = items.reduce((s, r) => s + Number(r.sosta_price || 0), 0);
    const byKind = items.reduce((acc: any, r) => {
      acc[r.kind] = (acc[r.kind] || 0) + 1; return acc;
    }, {});
    const kpis = { totKm, totPrice, totSosta, totSostaPrice, count: items.length, byKind };

    const apiKey = getAiApiKey();
    if (!apiKey) {
      return { text: `Registrati ${items.length} trasporti · ${totKm.toFixed(0)} km · €${totPrice.toFixed(2)} · sosta ${totSosta.toFixed(1)}h (€${totSostaPrice.toFixed(2)}).`, kpis };
    }
    try {
      const sample = items.slice(0, 40).map((r) => ({
        kind: r.kind, date: r.transport_date, km: r.kilometers, price: r.price,
        sosta_h: r.sosta_hours, sosta_price: r.sosta_price,
        from: r.departure_text, to: r.arrival_text,
      }));
      const prompt = `Sei un analista logistico ambulanze. Riassumi in italiano, 3-4 righe massimo, con tono professionale e conciso, i trasporti secondari del mese. Evidenzia trend, tratte ricorrenti, incidenza soste, eventuali anomalie. Dati aggregati: ${JSON.stringify(kpis)}. Campione: ${JSON.stringify(sample)}`;
      const res = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...aiAuthHeaders(apiKey) },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const j: any = await res.json();
      const text = j.choices?.[0]?.message?.content?.trim() || "Analisi non disponibile.";
      return { text, kpis };
    } catch (e: any) {
      return { text: `Registrati ${items.length} trasporti · ${totKm.toFixed(0)} km · €${totPrice.toFixed(2)}.`, kpis };
    }
  });

// Suggerimento AI-lite (statistica) sui trasporti passati di un paziente
export const suggestTransport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lastName: z.string().trim().min(2).max(100),
    kind: z.enum(["intra", "other", "nurse"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertTransportsAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ln = data.lastName.trim();
    if (ln.length < 2) return { suggestions: [] as any[] };
    const { data: rows } = await supabaseAdmin
      .from("secondary_transports")
      .select("first_name,last_name,first_name_2,last_name_2,kind,departure_hospital_id,arrival_hospital_id,departure_text,arrival_text,kilometers,price,sosta_hours,nurse_hours,nurse_hourly,is_round_trip")
      .eq("kind", data.kind)
      .ilike("last_name", `${ln}%`)
      .order("transport_date", { ascending: false })
      .limit(20);
    const items = (rows ?? []) as any[];
    if (items.length === 0) return { suggestions: [] };
    // Aggrega per firma tratta
    const map = new Map<string, { count: number; sample: any }>();
    for (const r of items) {
      const key = [
        r.first_name, r.departure_hospital_id, r.arrival_hospital_id,
        r.departure_text, r.arrival_text, r.is_round_trip,
      ].join("|");
      const cur = map.get(key);
      if (cur) cur.count++;
      else map.set(key, { count: 1, sample: r });
    }
    const suggestions = Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((x) => ({ count: x.count, ...x.sample }));
    return { suggestions };
  });

// Import intelligente da testo libero o PDF (base64)
export const parseTransportsText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    text: z.string().trim().max(200_000).optional(),
    kind: z.enum(["intra", "other", "nurse"]),
    pdfBase64: z.string().max(15_000_000).optional(),
    filename: z.string().trim().max(255).optional(),
    mimeType: z.enum(["application/pdf"]).optional(),
  }).refine((value) => Boolean(value.text || value.pdfBase64), "Fornire testo o PDF").parse(d))
  .handler(async ({ data, context }) => {
    await assertTransportsAccess(context);
    const apiKey = getAiApiKey();
    if (!apiKey) throw new Error("AI non disponibile (AI_GATEWAY_API_KEY mancante)");
    if (!data.text?.trim() && !data.pdfBase64) throw new Error("Fornire testo o PDF");

    const schemaHint = `{ "rows": [{ "kind": "intra"|"other"|"nurse", "date": "YYYY-MM-DD", "first_name": "", "last_name": "", "first_name_2": "", "last_name_2": "", "departure": "", "arrival": "", "kilometers": 0, "price": 0, "sosta_hours": 0, "sosta_price": 0, "is_round_trip": false, "annullato": false, "nurse_hours": 0, "nurse_hourly": 0, "departure_time": "HH:MM", "arrival_time": "HH:MM", "notes": "" }] }`;
    const instruction = `Sei un parser di trasporti sanitari. Estrai TUTTE le righe di trasporto dal contenuto fornito e restituisci SOLO JSON valido con questo schema esatto: ${schemaHint}.

REGOLE:
- "kind" per riga dall'intestazione sezione: "TRASPORTI OSPEDALIERI"→intra, "TRASPORTI ADI"/"ALTRI"/"VARI"→other, "TRASPORTI CON INFERMIERE"→nurse. Se nessuna intestazione, usa kind="${data.kind}".
- DUE PAZIENTI: se una riga indica due nominativi (es. "ROSSI MARIO + BIANCHI LUIGI", "ROSSI M. / BIANCHI L.", "PAZIENTE 1 ... PAZIENTE 2 ..."), metti il primo in first_name/last_name e il secondo in first_name_2/last_name_2. Se il paziente è uno solo lascia first_name_2 e last_name_2 vuoti.
- NOMI ABBREVIATI: riporta i nominativi ESATTAMENTE come scritti nel documento (es. "ROSSI M.", "M. ROSSI"): NON completare, NON espandere e NON correggere le abbreviazioni o le iniziali puntate.
- Estrai SEMPRE "departure" e "arrival" quando presenti (colonne REPARTO ORIGINE/PARTENZA e DESTINAZIONE).
- KM OBBLIGATORI: "kilometers" va SEMPRE compilato quando nella riga esiste un valore chilometrico (colonne KM/KM TOT/KM PERCORSI/CHILOMETRI, oppure un numero che precede la tariffa). Copia il numero ESATTAMENTE come nel documento, senza ricalcolarlo, senza dimezzarlo e senza raddoppiarlo. Metti 0 SOLO se nella riga il valore è realmente 0 o assente. Non lasciare mai kilometers a null se un numero km è presente.
- Estrai "price" (colonna TARIFFA €/TARIFFA/PREZZO) e "sosta_price" (€ SOSTA) ESATTAMENTE come nel PDF, senza ricalcolarli. Punto decimale (174.00). NON dimezzare né raddoppiare i prezzi A/R.
- Le righe di testo hanno le colonne separate da spazi multipli: rispetta l'ordine tipico DATA · PAZIENTE · PARTENZA · DESTINAZIONE · [ORE] · KM · TARIFFA · ORE SOSTA · € SOSTA. Non saltare i valori numerici intermedi.
- Reparti Latisana (PS, MED A, MED B, MED, PED, ORT, ORL, CHI, GIN, DH, RSA, PPI, CARDIO, NEURO, ONCO) vanno in "departure" così come sono.
- A/R (X2): se in QUALSIASI punto della riga compare "X2", "x 2", "A/R", "AR", "A.R.", "andata e ritorno", "andata/ritorno" → is_round_trip=true e rimuovi quel suffisso/annotazione da arrival (e da departure). Non alterare km e tariffa per questo motivo.
- Date italiane gg/mm/aaaa → YYYY-MM-DD.
- ORARI OBBLIGATORI quando presenti: "departure_time" = ora di partenza (ORA PARTENZA/ORARIO PARTENZA/PARTENZA/USCITA/DALLE) e "arrival_time" = ora di arrivo o rientro (ARRIVO/RIENTRO/ORA ARRIVO/ALLE). Riconosci formati "8.05", "8,05", "805", "08:05" e normalizza SEMPRE in 24h "HH:MM". Se in una riga ci sono due orari senza etichetta, il primo è departure_time e il secondo arrival_time. Se un orario non c'è, lascia il campo vuoto: non inventarlo.
- ANNULLATI: se una riga è barrata, contiene "ANNULLATO", "ANNULLATA", "CANCELLATO", "DISDETTO" oppure riporta chiaramente km e tariffa entrambi a 0, imposta annullato=true. Non scartare mai la riga annullata e conserva gli eventuali valori presenti, compreso lo zero.
- SOSTA: estrai sempre sia "sosta_hours" dalle colonne ORE SOSTA/ORE DI SOSTA/SOSTA sia "sosta_price" dalle colonne € SOSTA/PREZZO SOSTA. Non confondere le ore di sosta con gli orari di partenza o arrivo. Se assenti usa 0.
- COGNOME: ogni trasporto deve contenere almeno last_name. Se il nominativo è abbreviato, conserva esattamente l'abbreviazione senza inventare lettere.
- Ignora intestazioni tabella, totali (TOTALI/TOT KM/TOT EURO), numeri di riga isolati.
- Paziente "COGNOME NOME" (maiuscolo): prima parola cognome, resto nome.
- Restituisci SEMPRE {"rows":[...]}. Mai stringhe/markdown/spiegazioni.`;

    const { askAi, splitText, extractRows, aiErrorMessage } = await import("./transports-ai.server");

    const runOnce = async (parts: any[]) => extractRows(await askAi(apiKey, parts as any));


    try {
      // PDF scansionato (nessun testo estratto): singola chiamata con il file.
      if (!data.text?.trim() && data.pdfBase64) {
        const mime = data.mimeType || "application/pdf";
        const rows = await runOnce([
          { type: "text", text: instruction },
          { type: "file", file: { filename: data.filename || "trasporti.pdf", file_data: `data:${mime};base64,${data.pdfBase64}` } },
        ]);
        return { rows };
      }

      // Testo: spezzato in blocchi per evitare errori upstream su richieste lunghe.
      const chunks = splitText(data.text!.trim());
      const all: any[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const parts = [
          { type: "text", text: instruction },
          { type: "text", text: `Contenuto testuale (parte ${i + 1} di ${chunks.length}):\n\n${chunks[i] ?? ""}` },
          { type: "text", text: `PROMEMORIA: per OGNI riga compila kilometers (numero km del documento), departure_time e arrival_time in "HH:MM" se presenti, e is_round_trip=true se compare X2/A/R.` },
        ];


        const rows = await runOnce(parts);
        all.push(...rows);
      }
      return { rows: all };
    } catch (err) {
      throw new Error(aiErrorMessage(err));
    }
  });


