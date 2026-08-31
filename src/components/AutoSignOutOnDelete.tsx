import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Listens for the current user's profile:
 *  - DELETE (cascade from auth.users) → sign out immediately
 *  - UPDATE with active suspension      → sign out immediately
 */
export function AutoSignOutOnDelete() {
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const isActivelySuspended = (row: any) => {
      if (!row?.suspended_at) return false;
      if (!row.suspended_until) return true;
      return new Date(row.suspended_until).getTime() > Date.now();
    };

    const getTokenIatMs = async (): Promise<number> => {
      const { data } = await supabase.auth.getSession();
      const tok = data.session?.access_token;
      if (!tok) return 0;
      try {
        const payload = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return typeof payload.iat === "number" ? payload.iat * 1000 : 0;
      } catch { return 0; }
    };

    const isForcedLogout = async (row: any) => {
      if (!row?.force_logout_at) return false;
      const iat = await getTokenIatMs();
      return new Date(row.force_logout_at).getTime() > iat;
    };

    const forceSignOut = async () => {
      try { await supabase.auth.signOut(); } catch {}
      if (typeof window !== "undefined") window.location.replace("/auth?suspended=1");
    };

    const start = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid || cancelled) return;

      // Controllo iniziale (l'utente potrebbe essere stato sospeso o disconnesso mentre era offline)
      const { data: prof } = await supabase
        .from("profiles" as any).select("suspended_at, suspended_until, force_logout_at")
        .eq("id", uid).maybeSingle();
      if (isActivelySuspended(prof)) { forceSignOut(); return; }
      if (await isForcedLogout(prof)) { forceSignOut(); return; }

      channel = supabase
        .channel(`profile-watch-${uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
          () => { forceSignOut(); },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
          async (payload: any) => {
            if (isActivelySuspended(payload.new)) { forceSignOut(); return; }
            if (await isForcedLogout(payload.new)) { forceSignOut(); return; }
          },
        )
        .subscribe();
    };

    start();
    const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (channel) { await supabase.removeChannel(channel); channel = null; }
        start();
      }
      if (event === "SIGNED_OUT" && channel) {
        await supabase.removeChannel(channel);
        channel = null;
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
