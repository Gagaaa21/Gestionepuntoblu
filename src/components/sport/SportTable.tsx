import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Pencil, Paperclip } from "lucide-react";
import { assetLabel } from "@/lib/xlsx-sport";

const hhmm = (v?: string | null) => (v ? String(v).slice(0, 5) : "");

/** Tabella stile Excel: una riga per ogni mezzo impiegato nell'evento. */
export function SportTable({
  rows,
  selected,
  onToggleSelect,
  onOpen,
  onEdit,
}: {
  rows: any[];
  selected: Set<string>;
  onToggleSelect: (id: string, on: boolean) => void;
  onOpen: (s: any) => void;
  onEdit: (s: any) => void;
}) {
  const th = "px-2 py-2 text-left font-medium text-[11px] uppercase tracking-wide text-muted-foreground whitespace-nowrap";
  const td = "px-2 py-1.5 align-top";

  // Espande i servizi: una riga per mezzo (almeno una riga se non ci sono mezzi).
  const lines = rows.flatMap((s) => {
    const assets: any[] = (s.assets ?? []).length ? s.assets : [null];
    return assets.map((a, idx) => ({ s, a, idx, count: assets.length }));
  });

  return (
    <div className="rounded-xl border overflow-x-auto bg-card">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-muted/60 sticky top-0">
          <tr>
            <th className={th}></th>
            <th className={th}>Data</th>
            <th className={th}>Evento</th>
            <th className={th}>Orario</th>
            <th className={th}>Location</th>
            <th className={th}>Mezzo</th>
            <th className={th}>Orario mezzo</th>
            <th className={th}>Pers.</th>
            <th className={th}>Autista</th>
            <th className={th}>Soccorritori</th>
            <th className={th}>Cambi</th>
            <th className={th}>Medico</th>
            <th className={th}>BP</th>
            <th className={th}>ALS</th>
            <th className={th}>Pagato</th>
            <th className={th}>Svolto</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ s, a, idx, count }) => {
            const first = idx === 0;
            const changes = (s.crew_changes ?? []).filter(
              (c: any) => !c.vehicle_code || !a?.vehicle_code || String(c.vehicle_code).toUpperCase() === String(a.vehicle_code).toUpperCase(),
            );
            return (
              <tr
                key={`${s.id}-${idx}`}
                className={`hover:bg-muted/40 ${first ? "border-t-2 border-t-border" : "border-t border-dashed"}`}
                style={{ background: `${s.color}0d` }}
              >
                <td className={td}>
                  <div className="flex items-center gap-1">
                    <span className="h-4 w-1 rounded" style={{ background: s.color }} />
                    {first ? (
                      <Checkbox checked={selected.has(s.id)} onCheckedChange={(v) => onToggleSelect(s.id, !!v)} />
                    ) : (
                      <span className="inline-block w-4" />
                    )}
                  </div>
                </td>
                <td className={`${td} whitespace-nowrap ${first ? "" : "text-transparent select-none"}`}>
                  {new Date(s.event_date + "T00:00:00").toLocaleDateString("it-IT")}
                </td>
                <td className={td}>
                  {first ? (
                    <button className="font-medium text-left hover:underline" onClick={() => onOpen(s)}>
                      {s.event_name}
                      {count > 1 && <span className="ml-1 text-[10px] text-muted-foreground">({count} mezzi)</span>}
                    </button>
                  ) : (
                    <span className="text-muted-foreground/60 pl-2">↳</span>
                  )}
                </td>
                <td className={`${td} whitespace-nowrap font-mono tabular-nums ${first ? "" : "text-muted-foreground/40"}`}>
                  {first ? `${hhmm(s.start_time) || "—"}–${hhmm(s.end_time) || "—"}` : ""}
                </td>
                <td className={td}>{first ? s.location || "—" : ""}</td>
                <td className={`${td} font-medium whitespace-nowrap`}>{a ? assetLabel(a) : "—"}</td>
                <td className={`${td} whitespace-nowrap font-mono tabular-nums`}>
                  {a && (a.start_time || a.end_time) ? `${hhmm(a.start_time) || "—"}–${hhmm(a.end_time) || "—"}` : "—"}
                </td>
                <td className={`${td} text-center`}>{a?.crew || "—"}</td>
                <td className={td}>{a?.driver || "—"}</td>
                <td className={td}>{a?.rescuers || "—"}</td>
                <td className={`${td} text-center`}>{changes.length || "—"}</td>
                <td className={td}>{first ? s.doctor_name || "—" : ""}</td>
                <td className={`${td} text-center`}>{first ? (s.meal_voucher ? "Sì" : "—") : ""}</td>
                <td className={`${td} text-center`}>{first ? (s.als_backpack ? "Sì" : "—") : ""}</td>
                <td className={`${td} text-center`}>{first ? (s.paid ? "Sì" : "—") : ""}</td>
                <td className={`${td} text-center`}>{first ? (s.done ? "Sì" : "—") : ""}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {first && (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onOpen(s)}><Paperclip className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {lines.length === 0 && (
            <tr><td colSpan={17} className="px-3 py-8 text-center text-muted-foreground">Nessun servizio.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
