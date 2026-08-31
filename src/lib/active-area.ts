// Macro area attiva (Gestione SOGIT): limita le schede visibili nella navigazione.
export type ActiveArea = { id: string; name: string; tabs: string[] };

const KEY = "activeArea";

export function getActiveArea(): ActiveArea | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveArea;
    if (!parsed?.id || !Array.isArray(parsed.tabs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setActiveArea(area: ActiveArea) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(area));
  } catch { /* ignore */ }
}

export function clearActiveArea() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
