// Formats an operator username like "Gabriele.Simonovich" or
// "Martina.DeFlorio" into a display name "Gabriele Simonovich" /
// "Martina De Florio". Splits on "." then inserts spaces before
// internal capital letters (handles double surnames like "DeFlorio").
export function formatOperator(username: string | null | undefined): string {
  if (!username) return "—";
  return username
    .split(".")
    .map((part) =>
      part
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");
}
