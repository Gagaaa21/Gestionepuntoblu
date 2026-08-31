import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type TransportContext = {
  userId: string;
  supabase: SupabaseClient<Database>;
};

export async function assertTransportsAccess(context: TransportContext) {
  const { data, error } = await context.supabase.rpc("has_transports_access", { _uid: context.userId });
  if (error || !data) throw new Error("Accesso non autorizzato ai Trasporti secondari");
}