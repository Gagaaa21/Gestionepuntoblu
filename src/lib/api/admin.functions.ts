import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  LOCK_MINUTES,
  LOCK_THRESHOLD,
  assertAdmin,
  assertAdminOrDeveloper,
  assertDeveloper,
  usernameToEmail,
} from "./admin.server";

export const resolveUsername = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("username").ilike("username", data.username.trim()).maybeSingle();
    if (!profile) return { email: null };
    return { email: usernameToEmail(profile.username) };
  });

// Called by the user immediately after a successful password change to clear the
// must_change_password flag (and optionally persist phone). Uses the admin client
// because the flag is locked down by a BEFORE UPDATE trigger.
export const completeFirstAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { phone?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const updates: any = { must_change_password: false, phone_prompted: true };
    const phoneTrim = (data.phone ?? "").trim();
    if (phoneTrim) updates.phone = phoneTrim;
    const { error } = await supabaseAdmin
      .from("profiles").update(updates).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Returns the caller's own phone number (column-level access is server-only)
export const getOwnPhone = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles").select("phone").eq("id", context.userId).maybeSingle();
    return { phone: (data as any)?.phone ?? null };
  });

// Updates the caller's own phone number
export const updateOwnPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { phone: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const v = (data.phone ?? "").trim();
    const { error } = await supabaseAdmin
      .from("profiles").update({ phone: v || null }).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Returns admin usernames + phones for the in-app contact list. Authenticated only.
export const listAdminContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return { admins: [] as { username: string; phone: string | null }[] };
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("username, phone, show_in_contacts").in("id", ids);
    const admins = (((profs as any) ?? []) as { username: string; phone: string | null; show_in_contacts?: boolean }[])
      .filter((a) => a.show_in_contacts !== false)
      .map(({ username, phone }) => ({ username, phone }));
    return { admins };
  });

// Lista degli operatori abilitati alla sezione Prestazioni ufficio
// (utenti con ruoli admin + office). Usata per il menù a tendina.
export const listOfficeOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: caller } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const callerRoles = (caller ?? []).map((r: any) => r.role);
    if (!(callerRoles.includes("admin") && callerRoles.includes("office"))) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const byUser = new Map<string, Set<string>>();
    (roles ?? []).forEach((r: any) => {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Set());
      byUser.get(r.user_id)!.add(r.role);
    });
    const ids = Array.from(byUser.entries())
      .filter(([, rs]) => rs.has("admin") && rs.has("office"))
      .map(([id]) => id);
    if (ids.length === 0) return { operators: [] as { id: string; username: string }[] };
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id, username").in("id", ids);
    return {
      operators: ((profs as any) ?? [])
        .map((p: any) => ({ id: p.id, username: p.username }))
        .sort((a: any, b: any) => a.username.localeCompare(b.username, "it", { sensitivity: "base" })),
    };
  });

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    username: string; tempPassword: string; isAdmin: boolean;
    jobTitle?: "soccorritore" | "infermiere" | "medico" | null;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = (data.username ?? "").trim();
    const tempPassword = (data.tempPassword ?? "").trim();
    if (!username) throw new Error("Nome utente mancante");
    if (tempPassword.length < 6) throw new Error("Password temporanea troppo corta (min 6 caratteri)");
    const email = usernameToEmail(username);
    const { data: existing } = await supabaseAdmin
      .from("profiles").select("id").ilike("username", username).maybeSingle();
    if (existing) throw new Error("Nome utente già esistente");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email, password: tempPassword, email_confirm: true,
      user_metadata: { username },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Errore creazione utente");
    // job_title solo se il chiamante è developer
    let jobTitle: string | null = null;
    if (data.jobTitle) {
      const { data: myRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
      if ((myRoles ?? []).some((r: any) => r.role === "developer")) jobTitle = data.jobTitle;
    }
    const { error: profErr } = await supabaseAdmin
      .from("profiles").insert({ id: created.user.id, username, must_change_password: true, job_title: jobTitle });
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
      throw new Error(`Errore creazione profilo: ${profErr.message}`);
    }
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles").insert({ user_id: created.user.id, role: data.isAdmin ? "admin" : "user" });
    if (roleErr) {
      await supabaseAdmin.from("profiles").delete().eq("id", created.user.id);
      await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
      throw new Error(`Errore assegnazione ruolo: ${roleErr.message}`);
    }
    return { ok: true };
  });



export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, username, must_change_password, created_at, phone, suspended_at, suspended_until, suspended_reason, job_title, show_in_contacts")
      .order("created_at", { ascending: false });
    const { data: allRoles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const { data: allPerms } = await supabaseAdmin
      .from("user_permissions")
      .select("user_id, can_create_interventions, can_modify_own_interventions, can_view_others_interventions, can_manage_anagraphics");
    const permsById = new Map((allPerms ?? []).map((p: any) => [p.user_id, p]));
    return (profiles ?? []).map((p) => ({
      ...p,
      isAdmin: !!allRoles?.some((r) => r.user_id === p.id && r.role === "admin"),
      permissions: permsById.get(p.id) ?? {
        can_create_interventions: true,
        can_modify_own_interventions: true,
        can_view_others_interventions: true,
        can_manage_anagraphics: true,
      },
    }));
  });

// Admin: sospende un utente. expiresAt vuoto = sospensione indeterminata
export const adminSuspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; reason: string; expiresAt: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Non puoi sospendere te stesso");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("username").eq("id", data.userId).maybeSingle();
    if (prof?.username === "Gabriele.Simonovich") throw new Error("L'admin programmatore non può essere sospeso");
    const { error } = await supabaseAdmin.from("profiles").update({
      suspended_at: new Date().toISOString(),
      suspended_until: data.expiresAt ?? null,
      suspended_reason: (data.reason ?? "").trim() || null,
      suspended_by: context.userId,
    }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.auth.admin.signOut(data.userId, "global").catch(() => {});
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId, action: "USER_SUSPENDED", entity: "auth",
      details: { target_user: data.userId, reason: data.reason, expires_at: data.expiresAt },
    });
    return { ok: true };
  });

export const adminUnsuspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({
      suspended_at: null, suspended_until: null, suspended_reason: null, suspended_by: null,
    }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId, action: "USER_UNSUSPENDED", entity: "auth",
      details: { target_user: data.userId },
    });
    return { ok: true };
  });

// Admin: forza il logout immediato di un utente (senza sospensione).
// Revoca TUTTE le sessioni e i refresh token via SQL SECURITY DEFINER (l'endpoint REST
// /auth/v1/admin/users/{id}/logout non esiste su Supabase Cloud e restituisce 404).
export const adminForceLogout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: res, error } = await context.supabase.rpc(
      "admin_revoke_all_user_sessions",
      { _user_id: data.userId },
    );
    if (error) throw new Error(`Revoca fallita: ${error.message} (code ${error.code ?? "?"})`);
    const row = Array.isArray(res) ? res[0] : res;
    return {
      ok: true,
      revokedSessions: row?.revoked_sessions ?? 0,
      revokedRefreshTokens: row?.revoked_refresh_tokens ?? 0,
      force_logout_at: new Date().toISOString(),
    };
  });


export const adminUpdateUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    userId: string;
    can_create_interventions: boolean;
    can_modify_own_interventions: boolean;
    can_view_others_interventions: boolean;
    can_manage_anagraphics: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_permissions").upsert({
      user_id: data.userId,
      can_create_interventions: data.can_create_interventions,
      can_modify_own_interventions: data.can_modify_own_interventions,
      can_view_others_interventions: data.can_view_others_interventions,
      can_manage_anagraphics: data.can_manage_anagraphics,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId, action: "USER_PERMISSIONS_UPDATED", entity: "auth",
      details: { target_user: data.userId },
    });
    return { ok: true };
  });

export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = !!roles?.some((r: any) => r.role === "admin");
    const { data: permRow } = await supabaseAdmin
      .from("user_permissions")
      .select("can_create_interventions, can_modify_own_interventions, can_view_others_interventions, can_manage_anagraphics, can_manage_transports")
      .eq("user_id", context.userId).maybeSingle();
    const canManageTransports = isAdmin && !!(permRow as any)?.can_manage_transports;
    if (isAdmin) return {
      can_create_interventions: true, can_modify_own_interventions: true,
      can_view_others_interventions: true, can_manage_anagraphics: true,
      can_manage_transports: canManageTransports, is_admin: true,
    };
    return {
      can_create_interventions: (permRow as any)?.can_create_interventions ?? true,
      can_modify_own_interventions: (permRow as any)?.can_modify_own_interventions ?? true,
      can_view_others_interventions: (permRow as any)?.can_view_others_interventions ?? true,
      can_manage_anagraphics: (permRow as any)?.can_manage_anagraphics ?? true,
      can_manage_transports: false,
      is_admin: false,
    };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Non puoi eliminare te stesso");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("username").eq("id", data.userId).maybeSingle();
    if (prof?.username === "Gabriele.Simonovich") {
      throw new Error("L'admin programmatore Gabriele.Simonovich non può essere eliminato");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin: reset password (generate new temporary password)
export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // generate a readable temporary password
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let tmp = "";
    for (let i = 0; i < 10; i++) tmp += alphabet[Math.floor(Math.random() * alphabet.length)];
    const newPassword = `Tmp-${tmp}`;
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: newPassword });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ must_change_password: true, guide_seen: false, phone_prompted: false }).eq("id", data.userId);
    return { ok: true, tempPassword: newPassword };
  });

// Admin: set custom password
export const adminSetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; newPassword: string; mustChange: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.newPassword.length < 6) throw new Error("Password min 6 caratteri");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.newPassword });
    if (error) throw new Error(error.message);
    const updates: any = { must_change_password: data.mustChange };
    if (data.mustChange) { updates.guide_seen = false; updates.phone_prompted = false; }
    await supabaseAdmin.from("profiles").update(updates).eq("id", data.userId);
    return { ok: true };
  });

// Admin: rename user (changes username + derived email)
export const adminRenameUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; newUsername: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const newUsername = data.newUsername.trim();
    if (!newUsername) throw new Error("Nome utente non valido");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("profiles").select("id").eq("username", newUsername).maybeSingle();
    if (existing && existing.id !== data.userId) throw new Error("Nome utente già esistente");
    const newEmail = usernameToEmail(newUsername);
    const { error: e1 } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: newEmail,
      email_confirm: true,
      user_metadata: { username: newUsername },
    });
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin.from("profiles").update({ username: newUsername }).eq("id", data.userId);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const adminDeletePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { patientId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("patients").delete().eq("id", data.patientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteIntervention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { interventionId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("interventions").delete().eq("id", data.interventionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =================== Sicurezza avanzata & schede nascoste ===================

// Pre-login: risolve username->email e verifica blocco
export const preLoginCheck = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = data.username.trim().toLowerCase();
    type Susp = { until: string | null; reason: string | null } | null;
    if (!key) return { email: null as string | null, lockedUntil: null as string | null, suspended: null as Susp, degraded: false };
    const fallbackEmail = usernameToEmail(data.username);
    const { data: row, error: attemptsError } = await supabaseAdmin
      .from("auth_login_attempts").select("locked_until").eq("username_lower", key).maybeSingle();
    const lockedUntil = (row as any)?.locked_until as string | null | undefined;
    if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
      return { email: null, lockedUntil, suspended: null as Susp, degraded: false };
    }
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("username, suspended_at, suspended_until, suspended_reason")
      .ilike("username", data.username.trim()).maybeSingle();
    // Il lookup del profilo è un controllo aggiuntivo, non il meccanismo di
    // autenticazione. Se il Data API è temporaneamente indisponibile, lasciamo
    // che sia Auth a verificare le credenziali usando l'identità deterministica.
    // In questo modo un guasto di rete o di un servizio opzionale non blocca il login.
    if (profileError || attemptsError) {
      return { email: fallbackEmail, lockedUntil: null, suspended: null as Susp, degraded: true };
    }
    // Non riveliamo se lo username esiste: Auth darà sempre lo stesso errore
    // per credenziali errate. Questo copre anche profili momentaneamente non leggibili.
    if (!profile) return { email: fallbackEmail, lockedUntil: null, suspended: null as Susp, degraded: false };
    const p: any = profile;
    if (p.suspended_at && (!p.suspended_until || new Date(p.suspended_until).getTime() > Date.now())) {
      return { email: null, lockedUntil: null, suspended: { until: p.suspended_until, reason: p.suspended_reason }, degraded: false };
    }
    return { email: usernameToEmail(p.username), lockedUntil: null, suspended: null as Susp, degraded: false };
  });

// Registra l'esito del login. Aggiorna contatore o resetta.
export const recordLoginResult = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; success: boolean }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = data.username.trim().toLowerCase();
    if (!key) return { ok: true };
    if (data.success) {
      await supabaseAdmin.from("auth_login_attempts")
        .upsert({ username_lower: key, failed_count: 0, locked_until: null, last_attempt: new Date().toISOString() });
      await supabaseAdmin.from("audit_log").insert({
        actor_username: data.username.trim(), action: "LOGIN_SUCCESS", entity: "auth",
      });
      return { ok: true, lockedUntil: null as string | null };
    }
    const { data: cur } = await supabaseAdmin
      .from("auth_login_attempts").select("failed_count").eq("username_lower", key).maybeSingle();
    const newCount = ((cur as any)?.failed_count ?? 0) + 1;
    const lockedUntil = newCount >= LOCK_THRESHOLD
      ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
      : null;
    await supabaseAdmin.from("auth_login_attempts").upsert({
      username_lower: key, failed_count: newCount, locked_until: lockedUntil,
      last_attempt: new Date().toISOString(),
    });
    await supabaseAdmin.from("audit_log").insert({
      actor_username: data.username.trim(),
      action: lockedUntil ? "LOGIN_LOCKED" : "LOGIN_FAILED",
      entity: "auth",
      details: { failed_count: newCount },
    });
    return { ok: true, lockedUntil };
  });

export const adminListLockouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("auth_login_attempts")
      .select("*").order("last_attempt", { ascending: false }).limit(100);
    return { rows: (data ?? []) as any[] };
  });

export const adminResetLockout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = data.username.trim().toLowerCase();
    await supabaseAdmin.from("auth_login_attempts")
      .upsert({ username_lower: key, failed_count: 0, locked_until: null, last_attempt: new Date().toISOString() });
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId, action: "LOGIN_UNLOCKED", entity: "auth",
      details: { target_username: data.username.trim() },
    });
    return { ok: true };
  });

// ---- Hidden routes (developer only) ----
export const devSetRouteHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string; hidden: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertDeveloper(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.hidden) {
      await supabaseAdmin.from("hidden_routes")
        .upsert({ path: data.path, hidden_by: context.userId, hidden_at: new Date().toISOString() });
    } else {
      await supabaseAdmin.from("hidden_routes").delete().eq("path", data.path);
    }
    return { ok: true };
  });

// ---- Audit log (developer only) ----
export const devListAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    limit: z.number().int().min(1).max(500).optional(),
    entity: z.string().trim().max(80).optional(),
    action: z.string().trim().max(40).optional(),
    search: z.string().trim().max(100).optional(),
    since: z.string().datetime().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDeveloper(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("audit_log").select("*")
      .order("created_at", { ascending: false }).limit(Math.min(data.limit ?? 200, 500));
    if (data.entity) q = q.eq("entity", data.entity);
    if (data.action) q = q.eq("action", data.action);
    if (data.since) q = q.gte("created_at", data.since);
    if (data.search) q = q.or(`actor_username.ilike.%${data.search.replace(/[%_,()]/g, "")}%,entity.ilike.%${data.search.replace(/[%_,()]/g, "")}%`);
    const { data: rows } = await q;
    return { rows: (rows ?? []) as any[] };
  });

// ---- Sessioni attive (admin o developer) ----
export const devListActiveSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrDeveloper(context);
    const { data, error } = await context.supabase.rpc("list_active_sessions");
    if (error) throw new Error(`Errore caricamento sessioni: ${error.message} (code ${error.code ?? "?"})`);
    return { rows: (data ?? []) as Array<{
      session_id: string; user_id: string; username: string | null;
      created_at: string; updated_at: string | null;

      not_after: string | null; user_agent: string | null; ip: string | null;
    }> };
  });

// Revoca UNA singola sessione (admin/developer). Non tocca altri device dello stesso utente.
export const devRevokeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; sessionId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOrDeveloper(context);
    const { data: res, error } = await context.supabase.rpc(
      "admin_revoke_session", { _session_id: data.sessionId },
    );
    if (error) throw new Error(`Revoca fallita: ${error.message} (code ${error.code ?? "?"})`);
    const row = Array.isArray(res) ? res[0] : res;
    return {
      ok: true,
      revoked: row?.revoked_count ?? 0,
      targetUser: row?.target_user ?? data.userId,
      sessionId: data.sessionId,
    };
  });

// Revoca TUTTE le sessioni attive di un utente (admin/developer)
export const devRevokeAllUserSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOrDeveloper(context);
    const { data: res, error } = await context.supabase.rpc(
      "admin_revoke_all_user_sessions", { _user_id: data.userId },
    );
    if (error) throw new Error(`Revoca fallita: ${error.message} (code ${error.code ?? "?"})`);
    const row = Array.isArray(res) ? res[0] : res;
    return {
      ok: true,
      revokedSessions: row?.revoked_sessions ?? 0,
      revokedRefreshTokens: row?.revoked_refresh_tokens ?? 0,
      userId: data.userId,
    };
  });


// ============================================================
// Job titles (soccorritore / infermiere / medico) — solo developer
// ============================================================


export const devSetUserJobTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; jobTitle: "soccorritore" | "infermiere" | "medico" | null }) => d)
  .handler(async ({ data, context }) => {
    await assertDeveloper(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles")
      .update({ job_title: data.jobTitle }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Invia una comunicazione (notifica bloccante) a utenti scelti.
// Aperto a TUTTI gli utenti autenticati.
// ============================================================
export const adminBroadcastAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; body: string; userIds?: string[] | null }) => d)
  .handler(async ({ data, context }) => {
    const title = (data.title ?? "").trim().slice(0, 200);
    const body = (data.body ?? "").trim().slice(0, 4000);
    if (!title) throw new Error("Titolo mancante");
    if (!body) throw new Error("Testo della comunicazione mancante");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Recupera username del mittente per firmare la comunicazione
    const { data: senderProf } = await supabaseAdmin
      .from("profiles").select("username").eq("id", context.userId).maybeSingle();
    const senderName = (senderProf as any)?.username ?? "Utente";
    const signedBody = `${body}\n\n— ${senderName}`;

    let ids: string[] = [];
    if (data.userIds && data.userIds.length > 0) {
      const { data: profs, error } = await supabaseAdmin.from("profiles").select("id").in("id", data.userIds);
      if (error) throw new Error(error.message);
      ids = (profs ?? []).map((p: any) => p.id);
    } else {
      const { data: profs, error } = await supabaseAdmin.from("profiles").select("id");
      if (error) throw new Error(error.message);
      ids = (profs ?? []).map((p: any) => p.id);
    }
    const broadcastId = (globalThis.crypto as any)?.randomUUID?.() ?? undefined;
    const rows = ids.map((id) => ({
      user_id: id, title, body: signedBody, kind: "announcement", requires_ack: true,
      broadcast_id: broadcastId,
    }));
    if (rows.length === 0) return { ok: true, delivered: 0 };
    const { error: insErr } = await supabaseAdmin.from("notifications").insert(rows);
    if (insErr) throw new Error(insErr.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId, action: "ANNOUNCEMENT_SENT", entity: "notifications",
      details: { title, recipients: rows.length, targeted: !!(data.userIds && data.userIds.length), broadcast_id: broadcastId },
    });
    return { ok: true, delivered: rows.length, broadcastId };
  });

// ============================================================
// Admin: gestione comunicazioni (visualizzare presa visione, modificare, cancellare)
// ============================================================

// Elenca tutte le comunicazioni raggruppate per broadcast_id, con conteggio letture/prese visione.
export const adminListAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("id, broadcast_id, title, body, created_at, requires_ack, acknowledged_at, read_at, user_id")
      .eq("kind", "announcement")
      .not("broadcast_id", "is", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const groups = new Map<string, any>();
    for (const r of (data ?? []) as any[]) {
      const k = r.broadcast_id as string;
      const g = groups.get(k) ?? {
        broadcast_id: k, title: r.title, body: r.body, created_at: r.created_at,
        recipients: 0, acknowledged: 0, read: 0,
      };
      g.recipients += 1;
      if (r.acknowledged_at) g.acknowledged += 1;
      if (r.read_at) g.read += 1;
      // keep earliest created_at for display
      if (new Date(r.created_at).getTime() < new Date(g.created_at).getTime()) g.created_at = r.created_at;
      groups.set(k, g);
    }
    return Array.from(groups.values()).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });

// Dettaglio dei destinatari di una comunicazione, con stato di lettura e presa visione.
export const adminGetAnnouncementRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { broadcastId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("notifications")
      .select("id, user_id, read_at, acknowledged_at, created_at")
      .eq("broadcast_id", data.broadcastId);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id, username").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const nameMap = new Map<string, string>();
    (profs ?? []).forEach((p: any) => nameMap.set(p.id, p.username));
    return (rows ?? []).map((r: any) => ({
      user_id: r.user_id,
      username: nameMap.get(r.user_id) ?? "—",
      read_at: r.read_at,
      acknowledged_at: r.acknowledged_at,
    })).sort((a, b) => a.username.localeCompare(b.username));
  });

// Modifica titolo/testo di una comunicazione (tutte le righe che condividono broadcast_id).
export const adminUpdateAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { broadcastId: string; title: string; body: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const title = (data.title ?? "").trim().slice(0, 200);
    const body = (data.body ?? "").trim().slice(0, 4000);
    if (!title) throw new Error("Titolo mancante");
    if (!body) throw new Error("Testo mancante");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("notifications")
      .update({ title, body }, { count: "exact" })
      .eq("broadcast_id", data.broadcastId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId, action: "ANNOUNCEMENT_UPDATED", entity: "notifications",
      details: { broadcast_id: data.broadcastId, updated: count ?? 0 },
    });
    return { ok: true, updated: count ?? 0 };
  });

// Cancella una comunicazione per tutti i destinatari.
export const adminDeleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { broadcastId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("notifications")
      .delete({ count: "exact" })
      .eq("broadcast_id", data.broadcastId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId, action: "ANNOUNCEMENT_DELETED", entity: "notifications",
      details: { broadcast_id: data.broadcastId, deleted: count ?? 0 },
    });
    return { ok: true, deleted: count ?? 0 };
  });


// Public helper: fetch all profiles' job titles (letto in dashboard per mostrare icona vicino agli operatori)
export const listJobTitles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("profiles").select("username, job_title");
    if (error) throw new Error(error.message);
    return (data ?? []) as { username: string; job_title: string | null }[];
  });

// Elenco dei destinatari selezionabili per una comunicazione. Aperto a tutti gli autenticati.
export const adminListBroadcastTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles").select("id, username").order("username");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; username: string }[];
  });

