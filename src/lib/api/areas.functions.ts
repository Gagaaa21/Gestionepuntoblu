import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AreaRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  tabs: string[];
  sort_order: number;
};

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Non autorizzato");
}

// Aree visibili all'utente corrente (RLS: membri + admin/developer).
export const listMyAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const rs = ((roles ?? []) as any[]).map((r) => r.role as string);
    const { data, error } = await context.supabase
      .from("areas")
      .select("id, name, description, color, icon, tabs, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      areas: ((data ?? []) as any[]).map((a) => ({ ...a, tabs: Array.isArray(a.tabs) ? a.tabs : [] })) as AreaRow[],
      isAdmin: rs.includes("admin"),
      isDeveloper: rs.includes("developer"),
    };
  });

// Admin: tutte le aree con i membri assegnati.
export const adminListAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const [{ data: areas, error: aErr }, { data: members, error: mErr }] = await Promise.all([
      context.supabase.from("areas").select("*").order("sort_order").order("name"),
      context.supabase.from("area_members").select("area_id, user_id"),
    ]);
    if (aErr) throw new Error(aErr.message);
    if (mErr) throw new Error(mErr.message);
    const byArea = new Map<string, string[]>();
    for (const m of (members ?? []) as any[]) {
      if (!byArea.has(m.area_id)) byArea.set(m.area_id, []);
      byArea.get(m.area_id)!.push(m.user_id);
    }
    return ((areas ?? []) as any[]).map((a) => ({
      ...a,
      tabs: Array.isArray(a.tabs) ? a.tabs : [],
      members: byArea.get(a.id) ?? [],
    })) as (AreaRow & { members: string[] })[];
  });

export const adminSaveArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id?: string | null; name: string; description?: string | null;
    color?: string; icon?: string; tabs: string[]; sort_order?: number;
    members: string[];
  }) => data)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const name = (data.name ?? "").trim();
    if (!name) throw new Error("Nome obbligatorio");
    const payload = {
      name,
      description: (data.description ?? "").trim() || null,
      color: data.color || "navy",
      icon: data.icon || "layers",
      tabs: Array.from(new Set(data.tabs ?? [])),
      sort_order: Number.isFinite(data.sort_order) ? Number(data.sort_order) : 0,
    };
    let areaId = data.id ?? null;
    if (areaId) {
      const { error } = await context.supabase.from("areas").update(payload).eq("id", areaId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await context.supabase
        .from("areas").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      areaId = (ins as any).id as string;
    }
    const members = Array.from(new Set(data.members ?? []));
    const { error: delErr } = await context.supabase.from("area_members").delete().eq("area_id", areaId);
    if (delErr) throw new Error(delErr.message);
    if (members.length > 0) {
      const { error: insErr } = await context.supabase
        .from("area_members").insert(members.map((user_id) => ({ area_id: areaId!, user_id })));
      if (insErr) throw new Error(insErr.message);
    }
    return { ok: true, id: areaId };
  });

export const adminDeleteArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("areas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin: sceglie quali admin compaiono nella lista contatti.
export const adminSetContactVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; show: boolean }) => data)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles").update({ show_in_contacts: !!data.show } as any).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
