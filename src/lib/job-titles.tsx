"use client";

import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Ambulance, Stethoscope, Cross, User } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

export type JobTitle = "soccorritore" | "infermiere" | "medico" | null;

type JobMap = Record<string, JobTitle>;
const JobCtx = createContext<{ map: JobMap; refresh: () => void }>({ map: {}, refresh: () => {} });

export function JobTitlesProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<JobMap>({});

  const load = async () => {
    // Funzione sicura lato database: ogni utente autenticato vede username + qualifica
    // (le policy sui profili limitano la lettura diretta al proprio profilo).
    const { data, error } = await supabase.rpc("list_job_titles" as any);
    if (error || !data) return;
    const m: JobMap = {};
    (data as any[]).forEach((r: any) => { m[r.username] = (r.job_title ?? null) as JobTitle; });
    setMap(m);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("profiles-job-titles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .subscribe();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") load();
      if (event === "SIGNED_OUT") setMap({});
    });
    return () => { supabase.removeChannel(ch); sub.subscription.unsubscribe(); };
  }, []);

  return <JobCtx.Provider value={{ map, refresh: load }}>{children}</JobCtx.Provider>;
}

export function useJobTitle(username: string | null | undefined): JobTitle {
  const { map } = useContext(JobCtx);
  if (!username) return null;
  return map[username] ?? null;
}

const META: Record<Exclude<JobTitle, null>, { label: string; color: string; Icon: typeof Ambulance }> = {
  soccorritore: { label: "Soccorritore", color: "text-amber-600", Icon: Ambulance },
  infermiere: { label: "Infermiere", color: "text-sky-600", Icon: Stethoscope },
  medico: { label: "Medico", color: "text-emerald-600", Icon: Cross },
};

export function JobIcon({
  username, className = "", size = 14,
}: { username: string | null | undefined; className?: string; size?: number }) {
  const jt = useJobTitle(username);
  const m = jt ? META[jt] : null;
  const label = m ? m.label : "Ruolo non specificato";
  const Icon = m ? m.Icon : User;
  const color = m ? m.color : "text-muted-foreground";
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            title={label}
            aria-label={label}
            className={`inline-flex align-middle ${color} ${className}`}
          >
            <Icon style={{ width: size, height: size }} strokeWidth={2.2} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const JOB_TITLES: { value: Exclude<JobTitle, null>; label: string }[] = [
  { value: "soccorritore", label: "Soccorritore" },
  { value: "infermiere", label: "Infermiere" },
  { value: "medico", label: "Medico" },
];
