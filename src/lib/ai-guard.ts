/**
 * Degrado controllato delle funzioni AI.
 *
 * Regola d'oro: il sito deve funzionare SEMPRE, anche quando i crediti AI sono
 * esauriti o il gateway non risponde. Ogni errore AI viene marcato con il
 * prefisso `AI_UNAVAILABLE` e trattato dalla UI come una semplice nota, mai
 * come un errore bloccante.
 */

export const AI_UNAVAILABLE = "AI_UNAVAILABLE";

export function aiUnavailable(reason: string): Error {
  return new Error(`${AI_UNAVAILABLE}: ${reason}`);
}

export function isAiUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes(AI_UNAVAILABLE);
}

/** Messaggio utente, senza marker tecnico. */
export function aiMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.replace(new RegExp(`^${AI_UNAVAILABLE}:\\s*`), "").trim() ||
    "Funzione AI temporaneamente non disponibile.";
}

/* ---------------- Pausa lato client (evita chiamate inutili) ---------------- */

const PAUSE_KEY = "ai:pausedUntil";
const DEFAULT_PAUSE_MIN = 30;

export function pauseAiClient(minutes = DEFAULT_PAUSE_MIN): void {
  try {
    localStorage.setItem(PAUSE_KEY, String(Date.now() + minutes * 60_000));
  } catch {
    /* storage non disponibile: nessun problema */
  }
}

export function isAiPausedClient(): boolean {
  try {
    const raw = localStorage.getItem(PAUSE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    if (Date.now() >= until) {
      localStorage.removeItem(PAUSE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function resumeAiClient(): void {
  try {
    localStorage.removeItem(PAUSE_KEY);
  } catch {
    /* noop */
  }
}
