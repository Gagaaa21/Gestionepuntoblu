/**
 * Configurazione centralizzata per le funzioni AI (lettura trasporti,
 * previsioni affluenza, traduzione questionari).
 *
 * In origine il progetto usava il gateway AI gestito da Lovable
 * (https://ai.gateway.lovable.dev), disponibile solo all'interno di
 * Lovable Cloud. Qui si punta invece a un endpoint OpenAI-compatibile
 * configurabile via variabili d'ambiente, con OpenRouter come default
 * (accetta gli stessi id modello "provider/modello", es.
 * "google/gemini-2.5-flash", usati nel resto del codice).
 *
 * Variabili d'ambiente:
 *   AI_GATEWAY_API_KEY        obbligatoria per abilitare le funzioni AI
 *   AI_GATEWAY_URL             opzionale, default endpoint OpenRouter
 *   AI_GATEWAY_AUTH_HEADER     opzionale, default "Authorization"
 *
 * Per usare un provider diverso da OpenRouter (es. una chiamata diretta
 * alle API di OpenAI o di Google), imposta AI_GATEWAY_URL sull'endpoint
 * "chat/completions" compatibile con quel provider e, se necessario,
 * aggiorna gli id modello nei file che chiamano questo gateway.
 */

export const AI_GATEWAY_URL =
  process.env.AI_GATEWAY_URL || "https://openrouter.ai/api/v1/chat/completions";

const AUTH_HEADER_NAME = process.env.AI_GATEWAY_AUTH_HEADER || "Authorization";

/** Legge la API key configurata (supporta ancora LOVABLE_API_KEY per compatibilità). */
export function getAiApiKey(): string | undefined {
  return process.env.AI_GATEWAY_API_KEY || process.env.LOVABLE_API_KEY;
}

/** Header di autenticazione da inviare al gateway AI configurato. */
export function aiAuthHeaders(apiKey: string): Record<string, string> {
  const value = AUTH_HEADER_NAME === "Authorization" ? `Bearer ${apiKey}` : apiKey;
  return { [AUTH_HEADER_NAME]: value };
}
