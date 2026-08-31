import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type PaletteId =
  | "blue" | "emerald" | "violet" | "rose" | "amber" | "cyan" | "slate" | "crimson"
  | "indigo" | "teal" | "orange" | "pink";
export type RadiusId = "sharp" | "soft" | "round";
export type DensityId = "compact" | "comfortable" | "spacious";
export type FontId = "sans" | "serif" | "mono";

export type ThemePref = {
  palette: PaletteId;
  dark: boolean;
  radius: RadiusId;
  density: DensityId;
  font: FontId;
};

const DEFAULT: ThemePref = { palette: "blue", dark: false, radius: "soft", density: "comfortable", font: "sans" };
const KEY = "app.theme.pref";

const Ctx = createContext<{
  pref: ThemePref;
  setPalette: (p: PaletteId) => void;
  setDark: (d: boolean) => void;
  setRadius: (r: RadiusId) => void;
  setDensity: (d: DensityId) => void;
  setFont: (f: FontId) => void;
}>({ pref: DEFAULT, setPalette: () => {}, setDark: () => {}, setRadius: () => {}, setDensity: () => {}, setFont: () => {} });

function apply(pref: ThemePref) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-palette", pref.palette);
  root.setAttribute("data-radius", pref.radius);
  root.setAttribute("data-density", pref.density);
  root.setAttribute("data-font", pref.font);
  if (pref.dark) root.classList.add("dark"); else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<ThemePref>(DEFAULT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === "object") {
          const next: ThemePref = {
            palette: p.palette ?? DEFAULT.palette,
            dark: !!p.dark,
            radius: p.radius ?? DEFAULT.radius,
            density: p.density ?? DEFAULT.density,
            font: p.font ?? DEFAULT.font,
          };
          setPref(next); apply(next); return;
        }
      }
    } catch {/* ignore */}
    apply(DEFAULT);
  }, []);

  const update = (next: ThemePref) => {
    setPref(next); apply(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {/* ignore */}
  };

  return (
    <Ctx.Provider value={{
      pref,
      setPalette: (palette) => update({ ...pref, palette }),
      setDark: (dark) => update({ ...pref, dark }),
      setRadius: (radius) => update({ ...pref, radius }),
      setDensity: (density) => update({ ...pref, density }),
      setFont: (font) => update({ ...pref, font }),
    }}>{children}</Ctx.Provider>
  );
}

export function useTheme() { return useContext(Ctx); }

export const PALETTES: { id: PaletteId; label: string; swatch: string }[] = [
  { id: "blue",    label: "Blu",     swatch: "oklch(0.66 0.158 232)" },
  { id: "emerald", label: "Verde",   swatch: "oklch(0.66 0.15 160)"  },
  { id: "teal",    label: "Turchese",swatch: "oklch(0.68 0.12 190)"  },
  { id: "cyan",    label: "Ciano",   swatch: "oklch(0.7 0.13 210)"   },
  { id: "indigo",  label: "Indaco",  swatch: "oklch(0.55 0.2 265)"   },
  { id: "violet",  label: "Viola",   swatch: "oklch(0.62 0.2 295)"   },
  { id: "pink",    label: "Fucsia",  swatch: "oklch(0.68 0.22 340)"  },
  { id: "rose",    label: "Rosa",    swatch: "oklch(0.66 0.2 12)"    },
  { id: "crimson", label: "Cremisi", swatch: "oklch(0.55 0.22 25)"   },
  { id: "orange",  label: "Arancio", swatch: "oklch(0.68 0.18 55)"   },
  { id: "amber",   label: "Ambra",   swatch: "oklch(0.75 0.16 75)"   },
  { id: "slate",   label: "Grafite", swatch: "oklch(0.55 0.04 250)"  },
];

export const RADIUS_OPTIONS: { id: RadiusId; label: string }[] = [
  { id: "sharp", label: "Netti" },
  { id: "soft", label: "Morbidi" },
  { id: "round", label: "Molto arrotondati" },
];

export const DENSITY_OPTIONS: { id: DensityId; label: string }[] = [
  { id: "compact", label: "Compatto" },
  { id: "comfortable", label: "Standard" },
  { id: "spacious", label: "Spazioso" },
];

export const FONT_OPTIONS: { id: FontId; label: string }[] = [
  { id: "sans", label: "Moderno" },
  { id: "serif", label: "Classico" },
  { id: "mono", label: "Tecnico" },
];
