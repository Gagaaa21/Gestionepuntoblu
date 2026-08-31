import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck } from "lucide-react";
import { DeveloperPanel } from "@/components/DeveloperPanel";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Sicurezza e attività · Gestione S.O.G.IT." },
      { name: "description", content: "Controllo protetto delle sessioni, degli accessi e delle attività operative di Gestione S.O.G.IT." },
      { property: "og:url", content: "https://your-domain.example/security" },
      { property: "og:title", content: "Sicurezza e attività · Gestione S.O.G.IT." },
      { property: "og:description", content: "Controllo protetto delle sessioni, degli accessi e delle attività operative di Gestione S.O.G.IT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Sicurezza e attività · Gestione S.O.G.IT." },
      { name: "twitter:description", content: "Controllo protetto delle sessioni, degli accessi e delle attività operative di Gestione S.O.G.IT." },
    ],
    links: [{ rel: "canonical", href: "https://your-domain.example/security" }],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>("");
  const [isDev, setIsDev] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const u = sess.session?.user;
      if (!u) { navigate({ to: "/auth", replace: true }); return; }
      const [{ data: prof }, { data: roles }] = await Promise.all([
        supabase.from("profiles" as any).select("username").eq("id", u.id).maybeSingle(),
        supabase.from("user_roles" as any).select("role").eq("user_id", u.id),
      ]);
      const uname = (prof as any)?.username ?? "";
      const dev = ((roles as any) ?? []).some((r: any) => r.role === "developer");
      setUsername(uname);
      setIsDev(dev && uname === "Gabriele.Simonovich");
      if (!(dev && uname === "Gabriele.Simonovich")) {
        navigate({ to: "/dashboard", replace: true });
      }
    })();
  }, []);

  if (isDev !== true) return null;

  return (
    <div className="min-h-screen bg-linear-to-b from-background to-muted/40">
      <PageHeader
        tone="admin"
        icon={<ShieldCheck className="h-5 w-5" />}
        eyebrow="Riservato"
        title="Sicurezza e attività"
        subtitle="Controllo accessi e panoramica operativa del gestionale."
      />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <DeveloperPanel username={username} />
      </main>
    </div>
  );
}
