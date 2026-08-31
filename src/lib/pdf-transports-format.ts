// Pure helpers used by the ASUFC transports PDF export.

/** Normalizes any time value ("9", "9:5", "09:05:00", "0900") to "HH:MM". */
export function hhmm(value?: string | null): string {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2})(?:\D(\d{1,2}))?/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Builds a patient label that fits the column: full name, then
 * "Rossi Mario Luigi" -> "Rossi M. L.", then "Rossi M.", then surname only.
 */
export function shortenName(
  lastName: string | null | undefined,
  firstName: string | null | undefined,
  fits: (candidate: string) => boolean,
): string {
  const last = (lastName || "").trim().replace(/\s+/g, " ");
  const firstParts = (firstName || "").trim().split(/\s+/).filter(Boolean);
  const candidates: string[] = [];
  const full = [last, ...firstParts].filter(Boolean).join(" ");
  if (full) candidates.push(full);
  if (firstParts.length > 1) {
    candidates.push([last, ...firstParts.map((p) => `${p[0].toUpperCase()}.`)].filter(Boolean).join(" "));
    candidates.push([last, firstParts[0]].filter(Boolean).join(" "));
  }
  if (firstParts.length >= 1) {
    candidates.push([last, `${firstParts[0][0].toUpperCase()}.`].filter(Boolean).join(" "));
  }
  if (last) candidates.push(last);
  for (const candidate of candidates) {
    if (fits(candidate)) return candidate;
  }
  return candidates.at(-1) ?? "";
}
