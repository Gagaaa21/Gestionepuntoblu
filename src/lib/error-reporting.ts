/**
 * Segnalazione errori lato client.
 *
 * In origine questo hook inoltrava gli errori all'editor di Lovable
 * (window.__lovableEvents). Fuori da Lovable questo hook non esiste, quindi
 * qui ci si limita a loggare in console. Se vuoi collegare un servizio di
 * error tracking (Sentry, LogRocket, ecc.), sostituisci il corpo di
 * reportClientError con la chiamata a quel servizio.
 */

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[client-error]", error, {
    route: window.location.pathname,
    ...context,
  });
}
