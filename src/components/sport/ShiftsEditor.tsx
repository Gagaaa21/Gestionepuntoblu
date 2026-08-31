import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CrewInput } from "@/components/sport/CrewInput";
import { Clock, Plus, Trash2, Copy, ArrowRight } from "lucide-react";

export type CrewChange = {
  time: string;
  end_time?: string;
  kind: string;
  vehicle_code: string;
  driver: string;
  rescuers: string;
  note: string;
};

export const CHANGE_KINDS = ["Cambio autista", "Cambio soccorritore", "Cambio autista + soccorritore", "Cambio equipaggio completo"];

export const emptyChange = (): CrewChange => ({ time: "", end_time: "", kind: CHANGE_KINDS[0], vehicle_code: "", driver: "", rescuers: "", note: "" });

type AssetLite = { vehicle_code: string; type: string; driver: string; rescuers: string; start_time?: string | null; end_time?: string | null };

/** Editor dei cambi turno: timeline visiva + schede compatte per ogni cambio. */
export function ShiftsEditor({
  changes,
  onChange,
  assets,
  vehicles,
  people,
  serviceStart,
  serviceEnd,
}: {
  changes: CrewChange[];
  onChange: (next: CrewChange[]) => void;
  assets: AssetLite[];
  vehicles: { id: string; code: string }[];
  people: string[];
  serviceStart: string;
  serviceEnd: string;
}) {
  const patch = (i: number, p: Partial<CrewChange>) => onChange(changes.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const codes = Array.from(new Set(assets.map((a) => (a.vehicle_code || "").trim().toUpperCase()).filter(Boolean)));

  const addShift = (vehicle_code = "") => {
    const last = changes.filter((c) => !vehicle_code || c.vehicle_code === vehicle_code).at(-1);
    onChange([...changes, { ...emptyChange(), vehicle_code, time: last?.end_time || last?.time || serviceStart || "", end_time: serviceEnd || "" }]);
  };

  const copyFromAsset = (i: number) => {
    const code = changes[i].vehicle_code;
    const a = assets.find((x) => (x.vehicle_code || "").toUpperCase() === code) ?? assets[0];
    if (!a) return;
    patch(i, { driver: a.driver, rescuers: a.rescuers });
  };

  const sorted = [...changes].map((c, i) => ({ c, i })).sort((a, b) => (a.c.time || "").localeCompare(b.c.time || ""));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-2"><Clock className="h-4 w-4" />Cambi turno</Label>
        <div className="flex flex-wrap gap-1.5">
          {codes.map((c) => (
            <Button key={c} size="sm" variant="outline" type="button" onClick={() => addShift(c)}>
              <Plus className="h-3.5 w-3.5 mr-1" />Cambio {c}
            </Button>
          ))}
          <Button size="sm" variant="outline" type="button" onClick={() => addShift()}>
            <Plus className="h-3.5 w-3.5 mr-1" />Cambio generico
          </Button>
        </div>
      </div>

      {changes.length === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Nessun cambio turno. Aggiungine uno se il servizio è lungo e l'equipaggio si dà il cambio.
        </p>
      )}

      {changes.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Timeline</div>
          <div className="space-y-1">
            {sorted.map(({ c, i }) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-mono tabular-nums w-24 shrink-0">{c.time || "--:--"}{c.end_time ? `→${c.end_time}` : ""}</span>
                <span className="rounded bg-background border px-1.5 py-0.5">{c.vehicle_code || "tutti"}</span>
                <ArrowRight className="h-3 w-3 opacity-50" />
                <span className="truncate">{[c.driver, c.rescuers].filter(Boolean).join(" · ") || c.kind}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {changes.map((c, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Dalle</Label>
              <Input type="time" className="w-28" value={c.time} onChange={(e) => patch(i, { time: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Alle</Label>
              <Input type="time" className="w-28" value={c.end_time ?? ""} onChange={(e) => patch(i, { end_time: e.target.value })} />
            </div>
            <div className="space-y-1 min-w-36 flex-1">
              <Label className="text-[11px] text-muted-foreground">Mezzo</Label>
              <Select value={c.vehicle_code || "__none"} onValueChange={(v) => patch(i, { vehicle_code: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Mezzo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Tutti i mezzi</SelectItem>
                  {Array.from(new Set([...codes, ...vehicles.map((v) => v.code)])).map((code) => (
                    <SelectItem key={code} value={code}>{code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-44 flex-1">
              <Label className="text-[11px] text-muted-foreground">Tipo cambio</Label>
              <Select value={c.kind} onValueChange={(v) => patch(i, { kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHANGE_KINDS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => copyFromAsset(i)} title="Copia equipaggio dal mezzo">
              <Copy className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(changes.filter((_, k) => k !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Autista subentrante</Label>
              <CrewInput single value={c.driver} onChange={(v) => patch(i, { driver: v })} suggestions={people} placeholder="Nome autista" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Soccorritori subentranti</Label>
              <CrewInput value={c.rescuers} onChange={(v) => patch(i, { rescuers: v })} suggestions={people} />
            </div>
          </div>
          <Input value={c.note} onChange={(e) => patch(i, { note: e.target.value })} placeholder="Note sul cambio (facoltative)" />
        </div>
      ))}
    </div>
  );
}
