import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { startOfMonth, endOfMonth } from "date-fns";

const romeDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type OperatorHistory = {
  profile: {
    id: string;
    username: string;
    job_title: string | null;
    phone: string | null;
  } | null;
  interventions: {
    id: string;
    intervention_type: string;
    intervention_date: string;
    invio_in_ppi: boolean;
    fuori_sede: boolean;
    notes: string | null;
    patient_id: string | null;
    patient_last_name: string | null;
    patient_first_name: string | null;
    display_name: string | null;
  }[];
  stats: {
    total: number;
    thisMonth: number;
    ppiCount: number;
    fuoriSedeCount: number;
    byType: { type: string; count: number }[];
  };
};

export const getOperatorHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targetUsername = data.username.trim();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, username, job_title, phone")
      .eq("username", targetUsername)
      .maybeSingle();

    if (!profile) {
      throw new Error("Operatore non trovato");
    }

    const targetId = (profile as any).id;
    const callerId = context.userId;

    const { data: callerRoles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isAdmin = (callerRoles ?? []).some((r: any) => r.role === "admin");

    if (!isAdmin && targetId !== callerId) {
      const { data: perms } = await context.supabase
        .from("user_permissions")
        .select("can_view_others_interventions")
        .eq("user_id", callerId)
        .maybeSingle();
      if (!(perms as any)?.can_view_others_interventions) {
        throw new Error("Non autorizzato a visualizzare lo storico di questo operatore");
      }
    }

    const { data: interventions } = await supabaseAdmin
      .from("interventions")
      .select("*, patients:patient_id (first_name, last_name)")
      .eq("operator_username", targetUsername)
      .order("intervention_date", { ascending: false });

    type Row = OperatorHistory["interventions"][number];
    const rows: Row[] = ((interventions as any) ?? []).map((i: any) => {
      const patient = i.patients;
      const displayName: string | null = i.extra_data?.display_name ?? null;
      return {
        id: i.id,
        intervention_type: i.intervention_type,
        intervention_date: i.intervention_date,
        invio_in_ppi: i.invio_in_ppi,
        fuori_sede: i.fuori_sede,
        notes: i.notes,
        patient_id: i.patient_id,
        patient_last_name: patient?.last_name ?? null,
        patient_first_name: patient?.first_name ?? null,
        display_name: displayName,
      };
    });

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const thisMonth = rows.filter((r: Row) => {
      const d = new Date(r.intervention_date);
      return d >= monthStart && d <= monthEnd;
    }).length;

    const typeCounts = new Map<string, number>();
    rows.forEach((r: Row) => {
      typeCounts.set(r.intervention_type, (typeCounts.get(r.intervention_type) ?? 0) + 1);
    });
    const byType = Array.from(typeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // silence unused-warning for romeDateFmt in some tsconfigs
    void romeDateFmt;

    return {
      profile: {
        id: (profile as any).id,
        username: (profile as any).username,
        job_title: (profile as any).job_title ?? null,
        phone: (profile as any).phone ?? null,
      },
      interventions: rows,
      stats: {
        total: rows.length,
        thisMonth,
        ppiCount: rows.filter((r: Row) => r.invio_in_ppi).length,
        fuoriSedeCount: rows.filter((r: Row) => r.fuori_sede).length,
        byType,
      },
    } as OperatorHistory;
  });
