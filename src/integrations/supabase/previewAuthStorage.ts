// Storage per la sessione di autenticazione di Supabase.
//
// In origine, quando l'app girava dentro l'editor di Lovable, questa
// funzione "brokerava" la sessione con l'editor via postMessage per
// condividere il login tra le varie anteprime. Fuori da Lovable questo
// meccanismo non serve: si usa semplicemente il localStorage del browser.
export function brokeredPreviewStorage() {
  if (typeof window === "undefined") return undefined;
  return localStorage;
}
