import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotifPrefsRow = {
  user_id: string;
  toast: boolean;
  sound: boolean;
  browser: boolean;
  kinds: Record<string, boolean>;
  updated_at: string;
  updated_by: string | null;
};

const DEFAULTS = { toast: true, sound: true, browser: true, kinds: {} as Record<string, boolean> };

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId, _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Non autorizzato");
}

// Read the current user's prefs (defaults if row missing).
export const getMyNotifPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notification_prefs")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { user_id: context.userId, ...DEFAULTS, updated_at: new Date(0).toISOString(), updated_by: null };
    return data as NotifPrefsRow;
  });

// Admin: list all users + their prefs (defaults for missing rows).
export const adminListNotifPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data: profiles, error: pErr } = await context.supabase
      .from("profiles")
      .select("id, username")
      .order("username", { ascending: true });
    if (pErr) throw new Error(pErr.message);
    const { data: prefs, error: prErr } = await context.supabase
      .from("notification_prefs")
      .select("*");
    if (prErr) throw new Error(prErr.message);
    const byId = new Map<string, NotifPrefsRow>();
    for (const r of (prefs ?? []) as NotifPrefsRow[]) byId.set(r.user_id, r);
    return ((profiles ?? []) as { id: string; username: string }[]).map((p) => ({
      user_id: p.id,
      username: p.username,
      prefs: byId.get(p.id) ?? { user_id: p.id, ...DEFAULTS, updated_at: new Date(0).toISOString(), updated_by: null },
    }));
  });

// Admin: upsert prefs for a target user.
export const adminSetNotifPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    userId: string; toast: boolean; sound: boolean; browser: boolean;
    kinds: Record<string, boolean>;
  }) => data)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase
      .from("notification_prefs")
      .upsert({
        user_id: data.userId,
        toast: !!data.toast,
        sound: !!data.sound,
        browser: !!data.browser,
        kinds: data.kinds ?? {},
        updated_by: context.userId,
      }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
