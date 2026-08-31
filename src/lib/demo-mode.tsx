import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * MODALITÀ PROVA (solo admin)
 * ---------------------------------------------------------------
 * Permette di provare qualsiasi funzione del sito senza toccare i
 * dati reali: le letture restano vere, ogni scrittura viene
 * intercettata e salvata SOLO nel browser (sessionStorage).
 * Uscendo dalla modalità prova tutto sparisce.
 */

const STORAGE_KEY = "sogit.demo-mode";
const DATA_KEY = "sogit.demo-mode.data";

type DemoStore = Record<string, any[]>;

let store: DemoStore = {};
let storageSnapshot: { local: Record<string, string>; session: Record<string, string> } | null = null;

const readStore = (): DemoStore => {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(sessionStorage.getItem(DATA_KEY) ?? "{}"); } catch { return {}; }
};
const persist = () => {
  try { sessionStorage.setItem(DATA_KEY, JSON.stringify(store)); } catch { /* ignore */ }
};

export const isDemoActive = () =>
  typeof window !== "undefined" && sessionStorage.getItem(STORAGE_KEY) === "1";

function snapshotStorage(storage: Storage): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    const value = storage.getItem(key);
    if (value !== null) snapshot[key] = value;
  }
  return snapshot;
}

function restoreStorage(storage: Storage, snapshot: Record<string, string>) {
  for (const key of Object.keys(storage)) storage.removeItem(key);
  for (const [key, value] of Object.entries(snapshot)) storage.setItem(key, value);
}

const uuid = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function decorate(table: string, row: any) {
  const now = new Date().toISOString();
  return {
    id: row?.id ?? uuid(),
    created_at: row?.created_at ?? now,
    updated_at: row?.updated_at ?? now,
    ...row,
    __demo: true,
  };
}

/** Righe finte create in modalità prova per una tabella. */
export const demoRows = (table: string) => (isDemoActive() ? (store[table] ?? []) : []);

/** Cancella ogni traccia dei dati creati durante la modalità prova. */
export function purgeDemoData() {
  store = {};
  if (typeof window === "undefined") return;
  try {
    if (storageSnapshot) {
      restoreStorage(localStorage, storageSnapshot.local);
      restoreStorage(sessionStorage, storageSnapshot.session);
      storageSnapshot = null;
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(DATA_KEY);
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("sogit.demo-mode")) localStorage.removeItem(key);
      }
    }
  } catch { /* ignore */ }
}

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null;
  const url = request?.url ?? String(input);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const headers = new Headers(request?.headers);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return { url, method, headers };
}

async function fakeDatabaseResponse(input: RequestInfo | URL, init: RequestInit | undefined, url: string, method: string) {
  const table = new URL(url).pathname.split("/rest/v1/")[1]?.split("?")[0] ?? "unknown";
  let parsed: any = null;
  try {
    const request = input instanceof Request ? input.clone() : null;
    const raw = typeof init?.body === "string" ? init.body : request ? await request.text() : "";
    parsed = raw ? JSON.parse(raw) : null;
  } catch { /* a simulated write may have no JSON body */ }

  let responseData: any[] = [];
  if (method === "POST" && table !== "rpc" && parsed) {
    responseData = (Array.isArray(parsed) ? parsed : [parsed]).map((row) => decorate(table, row));
    store[table] = [...responseData, ...(store[table] ?? [])];
    persist();
  }

  return new Response(JSON.stringify(responseData), {
    status: method === "POST" ? 201 : 200,
    headers: {
      "content-type": "application/json",
      "content-range": `0-${Math.max(0, responseData.length - 1)}/${responseData.length}`,
    },
  });
}

async function databaseReadWithDemoRows(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  url: string,
  originalFetch: typeof window.fetch,
) {
  const response = await originalFetch(input, init);
  const table = new URL(url).pathname.split("/rest/v1/")[1]?.split("?")[0] ?? "unknown";
  const extra = store[table] ?? [];
  if (!response.ok || extra.length === 0) return response;

  try {
    const realData = await response.clone().json();
    if (!Array.isArray(realData)) return response;
    const merged = [...extra, ...realData];
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json");
    headers.set("content-range", `0-${Math.max(0, merged.length - 1)}/${merged.length}`);
    return new Response(JSON.stringify(merged), { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

function installFetchPatch() {
  if (typeof window === "undefined" || (window as any).__demoFetchPatched) return;
  (window as any).__demoFetchPatched = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: any, init?: any) => {
    if (isDemoActive()) {
      const { url, method, headers } = requestDetails(input, init);
      const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
      const isDatabaseWrite = url.includes("/rest/v1/") && isMutation;
      const isStorageWrite = url.includes("/storage/v1/") && isMutation;
      const isServerWrite = headers.get("x-tsr-serverfn") === "true" && isMutation;
      const isSameOriginApiWrite = url.startsWith(window.location.origin) && url.includes("/api/") && isMutation;

      if (isDatabaseWrite) return fakeDatabaseResponse(input, init, url, method);
      if (url.includes("/rest/v1/") && method === "GET") {
        return databaseReadWithDemoRows(input, init, url, origFetch);
      }
      if (isStorageWrite || isServerWrite || isSameOriginApiWrite) {
        throw new Error("Modalità prova attiva: operazione simulata, nessuna modifica è stata salvata.");
      }
    }
    return origFetch(input, init);
  };
}

type Ctx = { enabled: boolean; enable: () => void; disable: () => void };
const DemoCtx = createContext<Ctx>({ enabled: false, enable: () => {}, disable: () => {} });

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const active = isDemoActive();
    // Se la prova non è attiva, elimina qualunque residuo di dati finti.
    if (!active) purgeDemoData();
    store = active ? readStore() : {};
    installFetchPatch();
    setEnabled(active);

    // Chiudendo/ricaricando la scheda tutto ciò che è stato creato in prova sparisce.
    const onUnload = () => purgeDemoData();
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  const enable = useCallback(() => {
    purgeDemoData();
    storageSnapshot = {
      local: snapshotStorage(localStorage),
      session: snapshotStorage(sessionStorage),
    };
    sessionStorage.setItem(STORAGE_KEY, "1");
    store = {};
    persist();
    setEnabled(true);
  }, []);

  const disable = useCallback(() => {
    purgeDemoData();
    setEnabled(false);
    window.location.reload();
  }, []);

  const value = useMemo(() => ({ enabled, enable, disable }), [enabled, enable, disable]);
  return <DemoCtx.Provider value={value}>{children}</DemoCtx.Provider>;
}

export const useDemoMode = () => useContext(DemoCtx);
