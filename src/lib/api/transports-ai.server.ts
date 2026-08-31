/**
 * Lettura assistita dei documenti trasporti.
 *
 * Obiettivo: robustezza. Il gateway AI può rispondere con errori temporanei
 * (502/503 "service temporarily unavailable", 429, timeout upstream): qui si
 * ritenta con backoff, si cambia modello di riserva e i documenti lunghi
 * vengono spezzati in blocchi più piccoli (richieste brevi = meno errori).
 */

import { AI_GATEWAY_URL as GATEWAY, aiAuthHeaders } from "./ai-config.server";

const MODELS = ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite", "google/gemini-2.5-pro"];
const MAX_ATTEMPTS = 6;
const CHUNK_CHARS = 9_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type AiPart = { type: "text"; text: string } | { type: "file"; file: { filename: string; file_data: string } };

/** Spezza il testo in blocchi rispettando i confini di riga. */
export function splitText(text: string, size = CHUNK_CHARS): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (cur.length + line.length + 1 > size && cur.trim()) {
      out.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line;
  }
  if (cur.trim()) out.push(cur);
  return out.length > 0 ? out : [text];
}

/**
 * Una richiesta al gateway con ritentativi. Ritorna il contenuto testuale.
 * Lancia solo se tutti i tentativi (e i modelli di riserva) falliscono.
 */
export async function askAi(
  apiKey: string,
  content: AiPart[],
  opts?: { timeoutMs?: number },
): Promise<string> {
  let lastErr = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const model = MODELS[Math.min(Math.floor(attempt / 2), MODELS.length - 1)]!;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 4 * 60_000);
    try {
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...aiAuthHeaders(apiKey) },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (res.ok) {
        const j: any = await res.json();
        const out = j?.choices?.[0]?.message?.content;
        if (typeof out === "string" && out.trim()) return out;
        lastErr = "empty";
      } else {
        const body = (await res.text().catch(() => "")).slice(0, 300);
        lastErr = `${res.status}: ${body}`;
        // Errori definitivi: inutile insistere.
        if (res.status === 402) throw new Error("AI_CREDITS");
        if (res.status === 401 || res.status === 403) throw new Error("AI_AUTH");
        if (res.status === 400) throw new Error(`AI_BAD_REQUEST:${body}`);
        if (res.status === 429) {
          const ra = Number(res.headers.get("Retry-After"));
          await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 5_000);
          continue;
        }
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.startsWith("AI_")) throw e;
      lastErr = e?.name === "AbortError" ? "timeout" : msg || "network";
    } finally {
      clearTimeout(timer);
    }
    // Backoff progressivo con jitter prima del prossimo tentativo.
    if (attempt < MAX_ATTEMPTS - 1) await sleep(Math.min(20_000, 1_500 * 2 ** attempt) + Math.random() * 800);
  }
  throw new Error(`AI_UPSTREAM:${lastErr}`);
}

/** Estrae l'array righe da una risposta JSON del modello, tollerando markdown. */
export function extractRows(raw: string): any[] {
  const cleaned = String(raw).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (s: string) => {
    try { return JSON.parse(s); } catch { return null; }
  };
  let parsed = tryParse(cleaned);
  if (!parsed) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) parsed = tryParse(cleaned.slice(start, end + 1));
  }
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  if (Array.isArray(parsed?.data)) return parsed.data;
  return [];
}

/** Messaggio utente chiaro a partire dall'errore tecnico. */
export function aiErrorMessage(err: unknown): string {
  const msg = String((err as any)?.message || err || "");
  if (msg.startsWith("AI_CREDITS")) return "Crediti AI esauriti: puoi inserire i trasporti manualmente.";
  if (msg.startsWith("AI_AUTH")) return "Servizio AI non configurato correttamente su questo ambiente.";
  if (msg.startsWith("AI_BAD_REQUEST")) return "Il documento non è leggibile dall'AI: prova a incollare il testo.";
  if (msg.includes("timeout")) return "La lettura non ha ricevuto risposta. Il documento non è stato modificato: puoi riprovare.";
  return "Il servizio di lettura è momentaneamente occupato. Riprova tra qualche istante.";
}
