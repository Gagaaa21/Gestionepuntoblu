import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/daily-force-logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const stamp = new Date().toISOString();

        // 1) Bump force_logout_at per invalidare i JWT client-side
        const { error: updErr } = await supabaseAdmin
          .from("profiles")
          .update({ force_logout_at: stamp })
          .not("id", "is", null);
        if (updErr) {
          return new Response(JSON.stringify({ error: updErr.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        // 2) Cancella tutte le sessioni & refresh token attive via SQL admin (service role bypassa RLS)
        //    Nota: usiamo query dirette perché siamo service_role e le RPC richiedono auth.uid().
        let revokedSessions = 0, revokedRt = 0;
        try {
          const { count: rtC } = await supabaseAdmin
            .schema("auth" as any).from("refresh_tokens" as any)
            .delete({ count: "exact" }).not("id", "is", null);
          revokedRt = rtC ?? 0;
          const { count: sC } = await supabaseAdmin
            .schema("auth" as any).from("sessions" as any)
            .delete({ count: "exact" }).not("id", "is", null);
          revokedSessions = sC ?? 0;
        } catch (e: any) {
          await supabaseAdmin.from("audit_log").insert({
            actor_id: null, action: "DAILY_FORCE_LOGOUT_ERROR", entity: "auth",
            details: { stamp, error: e?.message ?? String(e) },
          });
        }

        await supabaseAdmin.from("audit_log").insert({
          actor_id: null, action: "DAILY_FORCE_LOGOUT", entity: "auth",
          details: { stamp, revoked_sessions: revokedSessions, revoked_refresh_tokens: revokedRt },
        });

        return new Response(
          JSON.stringify({ ok: true, revokedSessions, revokedRefreshTokens: revokedRt, stamp }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
