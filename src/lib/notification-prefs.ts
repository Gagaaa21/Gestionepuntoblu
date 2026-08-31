import { useEffect, useState } from "react";

export type NotifPrefs = {
  toast: boolean;
  sound: boolean;
  browser: boolean;
  kinds: Record<string, boolean>; // per-kind on/off; missing key = true
};

const OVERRIDE_KEY = "notif-overrides-v1";

export const KNOWN_KINDS: { key: string; label: string; description: string }[] = [
  { key: "announcement", label: "Comunicazioni / Annunci", description: "Avvisi bloccanti inviati dagli utenti" },
  { key: "intervention", label: "Interventi", description: "Nuovi interventi o aggiornamenti che ti riguardano" },
  { key: "report", label: "Segnalazioni", description: "Nuove segnalazioni o cambi di stato" },
  { key: "checklist", label: "Check list", description: "Promemoria e completamenti check list" },
  { key: "system", label: "Sistema", description: "Messaggi automatici del sistema" },
  { key: "other", label: "Altro", description: "Qualsiasi altra notifica non elencata" },
];

export const DEFAULT_PREFS: NotifPrefs = {
  toast: true,
  sound: true,
  browser: true,
  kinds: {},
};

// -------- Admin-defined prefs (from DB) --------
// Cached in localStorage as read-only mirror to keep the bell responsive.
const ADMIN_CACHE_KEY = "notif-admin-cache-v1";

export function loadAdminCache(): NotifPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(ADMIN_CACHE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...p, kinds: { ...(p?.kinds ?? {}) } };
  } catch { return DEFAULT_PREFS; }
}
export function saveAdminCache(p: NotifPrefs) {
  try { window.localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(p)); } catch { /* noop */ }
  try { window.dispatchEvent(new CustomEvent("notif-admin-change", { detail: p })); } catch { /* noop */ }
}

// -------- Local per-device overrides (user can only DISABLE) --------
export function loadOverrides(): NotifPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...p, kinds: { ...(p?.kinds ?? {}) } };
  } catch { return DEFAULT_PREFS; }
}
export function saveOverrides(p: NotifPrefs) {
  try { window.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(p)); } catch { /* noop */ }
  try { window.dispatchEvent(new CustomEvent("notif-override-change", { detail: p })); } catch { /* noop */ }
}

// Effective = AND of admin and override — user cannot enable what admin disabled.
export function effectivePrefs(admin: NotifPrefs, override: NotifPrefs): NotifPrefs {
  const kinds: Record<string, boolean> = {};
  const keys = new Set<string>([...Object.keys(admin.kinds), ...Object.keys(override.kinds)]);
  for (const k of keys) {
    const a = admin.kinds[k] ?? true;
    const o = override.kinds[k] ?? true;
    kinds[k] = a && o;
  }
  return {
    toast: admin.toast && override.toast,
    sound: admin.sound && override.sound,
    browser: admin.browser && override.browser,
    kinds,
  };
}

export function isKindEnabled(prefs: NotifPrefs, kind: string | null | undefined): boolean {
  const k = kind && KNOWN_KINDS.some((x) => x.key === kind) ? kind : "other";
  const v = prefs.kinds[k];
  return v === undefined ? true : v;
}

export function loadEffective(): NotifPrefs {
  return effectivePrefs(loadAdminCache(), loadOverrides());
}

export function useOverrides(): [NotifPrefs, (p: NotifPrefs) => void] {
  const [prefs, setPrefs] = useState<NotifPrefs>(() => loadOverrides());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<NotifPrefs>).detail;
      if (detail) setPrefs(detail); else setPrefs(loadOverrides());
    };
    const onStorage = (e: StorageEvent) => { if (e.key === OVERRIDE_KEY) setPrefs(loadOverrides()); };
    window.addEventListener("notif-override-change", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("notif-override-change", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [prefs, (p) => { saveOverrides(p); setPrefs(p); }];
}

export function useAdminCache(): NotifPrefs {
  const [prefs, setPrefs] = useState<NotifPrefs>(() => loadAdminCache());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<NotifPrefs>).detail;
      if (detail) setPrefs(detail); else setPrefs(loadAdminCache());
    };
    window.addEventListener("notif-admin-change", onChange);
    return () => window.removeEventListener("notif-admin-change", onChange);
  }, []);
  return prefs;
}
