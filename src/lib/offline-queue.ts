import { supabase } from "@/integrations/supabase/client";
import { isDemoActive } from "./demo-mode";

export type QueueOp = {
  id: string;
  table: string;
  payload: Record<string, any>;
  createdAt: number;
};

const KEY = "pb_offline_queue_v1";
const listeners = new Set<() => void>();
let flushing = false;

function safeRead(): QueueOp[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(ops: QueueOp[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(ops));
  listeners.forEach((l) => { try { l(); } catch {} });
}

export function pendingCount(): number { return safeRead().length; }

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function enqueueInsert(table: string, payload: Record<string, any>): QueueOp {
  const op: QueueOp = { id: (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random()}`, table, payload, createdAt: Date.now() };
  // In modalità prova non accodare nulla: al ritorno online finirebbe nell'archivio reale.
  if (isDemoActive()) return op;
  write([...safeRead(), op]);
  // try to flush soon (no-op if offline)
  setTimeout(() => { void flushQueue(); }, 50);
  return op;
}

export function isNetworkError(err: any): boolean {
  if (!err) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = (err.message || String(err)).toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network request failed") || msg.includes("load failed") || msg.includes("fetch");
}

export async function flushQueue(): Promise<{ ok: number; fail: number; remaining: number }> {
  if (typeof window === "undefined") return { ok: 0, fail: 0, remaining: 0 };
  if (isDemoActive()) return { ok: 0, fail: 0, remaining: pendingCount() };
  if (flushing) return { ok: 0, fail: 0, remaining: pendingCount() };
  if (!navigator.onLine) return { ok: 0, fail: 0, remaining: pendingCount() };
  flushing = true;
  let ok = 0, fail = 0;
  try {
    // Ensure authenticated
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return { ok, fail, remaining: pendingCount() };

    let ops = safeRead();
    while (ops.length > 0) {
      const op = ops[0];
      try {
        const { error } = await supabase.from(op.table as any).insert(op.payload);
        if (error) {
          const code = (error as any).code;
          // duplicate primary key → already synced; drop
          if (code === "23505") {
            ok++;
          } else if (isNetworkError(error)) {
            fail++;
            break;
          } else {
            // unrecoverable (validation/FK/RLS): drop to avoid blocking the queue forever
            console.warn("[offline-queue] dropping op due to error", op, error);
            fail++;
          }
        } else {
          ok++;
        }
      } catch (err) {
        if (isNetworkError(err)) { fail++; break; }
        console.warn("[offline-queue] dropping op due to exception", op, err);
        fail++;
      }
      const remaining = safeRead().slice(1);
      write(remaining);
      ops = remaining;
    }
  } finally {
    flushing = false;
  }
  return { ok, fail, remaining: pendingCount() };
}

let initialized = false;
export function initOfflineSync() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  window.addEventListener("online", () => { void flushQueue(); });
  window.addEventListener("focus", () => { void flushQueue(); });
  // Initial attempt
  if (navigator.onLine) {
    // slight delay to let auth session restore
    setTimeout(() => { void flushQueue(); }, 500);
  }
}
