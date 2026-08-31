export const LOCK_THRESHOLD = 5;
export const LOCK_MINUTES = 15;

const EMAIL_DOMAIN = "archivio.local";

export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@${EMAIL_DOMAIN}`;

export async function assertAdmin(context: any) {
  const { data: roles } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (!roles?.some((row: any) => row.role === "admin")) throw new Error("Forbidden");
}

export async function assertDeveloper(context: any) {
  const { data: roles } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (!roles?.some((row: any) => row.role === "developer")) throw new Error("Forbidden");
}

export async function assertAdminOrDeveloper(context: any) {
  const { data: roles } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roleSet = new Set((roles ?? []).map((row: any) => row.role));
  if (!(roleSet.has("admin") || roleSet.has("developer"))) {
    throw new Error("Non autorizzato: richiesto ruolo admin o developer");
  }
}