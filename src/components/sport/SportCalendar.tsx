const DOW = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const hhmm = (v?: string | null) => (v ? String(v).slice(0, 5) : "");

export function SportCalendar({
  rows,
  year,
  month,
  onOpen,
}: {
  rows: any[];
  year: number;
  month: number; // 1-12
  onOpen: (s: any) => void;
}) {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // lunedì = 0
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = new Map<number, any[]>();
  rows.forEach((s) => {
    const d = Number(s.event_date.slice(8, 10));
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/60">
        {DOW.map((d) => (
          <div key={d} className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const iso = day ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
          const items = day ? byDay.get(day) ?? [] : [];
          return (
            <div key={i} className={`min-h-24 border-t border-l p-1.5 space-y-1 ${day ? "" : "bg-muted/20"}`}>
              {day && (
                <div className={`text-[11px] font-medium ${iso === todayStr ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {day}
                </div>
              )}
              {items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onOpen(s)}
                  className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] text-white hover:opacity-90"
                  style={{ background: s.color || "#334155", opacity: s.done ? 0.65 : 1 }}
                  title={`${s.event_name} · ${hhmm(s.start_time)}–${hhmm(s.end_time)}`}
                >
                  <span className="font-mono">{hhmm(s.start_time) || "—"}</span> {s.event_name}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
