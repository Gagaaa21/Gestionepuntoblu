import { useState } from "react";
import {
  useTheme, PALETTES, RADIUS_OPTIONS, DENSITY_OPTIONS, FONT_OPTIONS,
  type PaletteId, type RadiusId, type DensityId, type FontId,
} from "@/lib/theme";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Palette, Sun, Moon, Check } from "lucide-react";

export function ThemePicker({ trigger }: { trigger?: React.ReactNode }) {
  const { pref, setPalette, setDark, setRadius, setDensity, setFont } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button type="button" className="nav-tile" aria-label="Tema">
            <span className="nav-tile-icon"><Palette className="h-4 w-4" /></span>
            Tema
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <ScrollArea className="max-h-[70vh]">
          <div className="p-3 space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Modalità</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={!pref.dark ? "default" : "outline"} size="sm" className="justify-start" onClick={() => setDark(false)}>
                  <Sun className="h-4 w-4 mr-2" /> Chiaro
                </Button>
                <Button variant={pref.dark ? "default" : "outline"} size="sm" className="justify-start" onClick={() => setDark(true)}>
                  <Moon className="h-4 w-4 mr-2" /> Scuro
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Colore</p>
              <div className="grid grid-cols-6 gap-2">
                {PALETTES.map((p) => {
                  const active = pref.palette === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPalette(p.id as PaletteId)}
                      title={p.label}
                      aria-label={p.label}
                      className={`relative h-9 rounded-lg border transition ${active ? "ring-2 ring-ring border-transparent" : "hover:scale-105"}`}
                      style={{ background: p.swatch }}
                    >
                      {active && <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Angoli</p>
              <div className="grid grid-cols-3 gap-2">
                {RADIUS_OPTIONS.map((o) => (
                  <Button key={o.id} variant={pref.radius === o.id ? "default" : "outline"} size="sm"
                    onClick={() => setRadius(o.id as RadiusId)}>{o.label}</Button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Densità</p>
              <div className="grid grid-cols-3 gap-2">
                {DENSITY_OPTIONS.map((o) => (
                  <Button key={o.id} variant={pref.density === o.id ? "default" : "outline"} size="sm"
                    onClick={() => setDensity(o.id as DensityId)}>{o.label}</Button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Carattere</p>
              <div className="grid grid-cols-3 gap-2">
                {FONT_OPTIONS.map((o) => (
                  <Button key={o.id} variant={pref.font === o.id ? "default" : "outline"} size="sm"
                    onClick={() => setFont(o.id as FontId)}>{o.label}</Button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">La scelta viene salvata su questo dispositivo.</p>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
