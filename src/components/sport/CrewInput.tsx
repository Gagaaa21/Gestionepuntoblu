import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";

/** Input a "chip" per l'inserimento dei membri dell'equipaggio.
 *  Il valore resta una stringa separata da virgola (compatibile con i dati esistenti). */
export function CrewInput({
  value,
  onChange,
  placeholder = "Aggiungi persona…",
  suggestions = [],
  single = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suggestions?: string[];
  single?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const people = useMemo(
    () => (value || "").split(",").map((s) => s.trim()).filter(Boolean),
    [value],
  );

  const commit = (list: string[]) => onChange(Array.from(new Set(list)).join(", "));
  const add = (name: string) => {
    const n = name.trim();
    if (!n) return;
    commit(single ? [n] : [...people, n]);
    setDraft("");
  };
  const remove = (i: number) => commit(people.filter((_, k) => k !== i));

  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return [];
    return suggestions
      .filter((s) => s.toLowerCase().includes(q) && !people.some((p) => p.toLowerCase() === s.toLowerCase()))
      .slice(0, 6);
  }, [draft, suggestions, people]);

  return (
    <div className="rounded-md border bg-background px-2 py-1.5 space-y-1.5">
      {people.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {people.map((p, i) => (
            <span key={`${p}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {p}
              <button type="button" onClick={() => remove(i)} aria-label={`Rimuovi ${p}`} className="opacity-60 hover:opacity-100">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {(!single || people.length === 0) && (
        <div className="relative">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
              if (e.key === "Backspace" && !draft && people.length) remove(people.length - 1);
            }}
            onBlur={() => add(draft)}
            placeholder={placeholder}
            className="h-8 border-0 px-1 shadow-none focus-visible:ring-0"
          />
          {matches.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
              {matches.map((m) => (
                <button
                  key={m}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); add(m); }}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
                >
                  <Plus className="h-3 w-3 opacity-60" />{m}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
