import { aiUnavailable } from "@/lib/ai-guard";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 45_000;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/* --------- Circuit breaker: dopo un 402/429 si smette di chiamare --------- */

let openUntil = 0;
let lastReason = "";

export function isAiCircuitOpen(): boolean {
  return Date.now() < openUntil;
}

function openCircuit(minutes: number, reason: string) {
  openUntil = Date.now() + minutes * 60_000;
  lastReason = reason;
}

export function aiCircuitReason(): string {
  return lastReason || "Funzioni AI temporaneamente sospese.";
}

/**
 * Chiama il gateway AI. Non lancia MAI errori generici: in caso di crediti
 * esauriti, rate limit, timeout o gateway non raggiungibile lancia un errore
 * marcato `AI_UNAVAILABLE`, che la UI mostra come nota non bloccante.
 */
export async function callAiGateway(
  messages: ChatMessage[],
  opts?: { model?: string; temperature?: number; jsonMode?: boolean; timeoutMs?: number },
): Promise<string> {
  if (isAiCircuitOpen()) throw aiUnavailable(aiCircuitReason());

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    openCircuit(10, "AI non configurata su questo ambiente.");
    throw aiUnavailable("AI non configurata su questo ambiente.");
  }

  const body: Record<string, unknown> = {
    model: opts?.model ?? DEFAULT_MODEL,
    temperature: opts?.temperature ?? 0.3,
    messages,
  };
  if (opts?.jsonMode) body.response_format = { type: "json_object" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw aiUnavailable("Servizio AI non raggiungibile in questo momento.");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 402) {
      openCircuit(60, "Crediti AI esauriti: le funzioni intelligenti sono sospese, il resto del sito funziona normalmente.");
      throw aiUnavailable(aiCircuitReason());
    }
    if (res.status === 429) {
      openCircuit(2, "Troppe richieste all'AI: riprova tra qualche minuto.");
      throw aiUnavailable(aiCircuitReason());
    }
    if (res.status >= 500) {
      openCircuit(5, "Servizio AI momentaneamente non disponibile.");
      throw aiUnavailable(aiCircuitReason());
    }
    throw aiUnavailable(`Richiesta AI non riuscita (${res.status}).`);
  }

  let content: string | undefined;
  try {
    const json: { choices?: { message?: { content?: string } }[] } = await res.json();
    content = json.choices?.[0]?.message?.content?.trim();
  } catch {
    throw aiUnavailable("Risposta AI non leggibile.");
  }
  if (!content) throw aiUnavailable("Risposta AI vuota.");
  return content;
}
