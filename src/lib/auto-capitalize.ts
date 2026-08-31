/**
 * Forza la prima lettera maiuscola nelle caselle di testo.
 * Tipi tecnici (password, email, numeri, orari, ricerche…) restano intatti.
 */

const EXCLUDED_TYPES = new Set([
  "password",
  "email",
  "number",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "url",
  "tel",
  "file",
  "checkbox",
  "radio",
  "range",
  "color",
  "hidden",
  "search",
]);

export function shouldAutoCapitalize(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el.dataset.noCapitalize === "true") return false;
  if (el instanceof HTMLTextAreaElement) return true;
  const type = (el.getAttribute("type") || "text").toLowerCase();
  if (EXCLUDED_TYPES.has(type)) return false;
  const mode = (el.getAttribute("inputmode") || "").toLowerCase();
  if (mode === "decimal" || mode === "numeric" || mode === "tel" || mode === "email" || mode === "url") return false;
  return true;
}

export function capitalizeFirst(value: string): string {
  if (!value) return value;
  const i = value.search(/\S/);
  if (i < 0) return value;
  const ch = value[i];
  const up = ch.toUpperCase();
  if (ch === up) return value;
  return value.slice(0, i) + up + value.slice(i + 1);
}

/** Applica la maiuscola iniziale mantenendo la posizione del cursore. */
export function applyAutoCapitalize(el: HTMLInputElement | HTMLTextAreaElement): void {
  if (!shouldAutoCapitalize(el)) return;
  const next = capitalizeFirst(el.value);
  if (next === el.value) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = next;
  try {
    if (start != null && end != null) el.setSelectionRange(start, end);
  } catch {
    /* alcuni tipi di input non supportano la selezione */
  }
}
