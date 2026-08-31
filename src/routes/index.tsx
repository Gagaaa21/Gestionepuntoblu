import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gestione S.O.G.IT. · Gestionale operativo Punto Blu" },
      {
        name: "description",
        content:
          "Gestionale operativo S.O.G.IT.: comunicazioni, trasporti secondari, servizi sportivi, checklist e questionari di gradimento.",
      },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app" },
      { property: "og:title", content: "Gestione S.O.G.IT. · Gestionale operativo Punto Blu" },
      {
        property: "og:description",
        content:
          "Gestionale operativo S.O.G.IT.: comunicazioni, trasporti secondari, servizi sportivi, checklist e questionari di gradimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Gestione S.O.G.IT. · Gestionale operativo Punto Blu" },
      {
        name: "twitter:description",
        content:
          "Gestionale operativo S.O.G.IT.: comunicazioni, trasporti secondari, servizi sportivi, checklist e questionari di gradimento.",
      },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app" }],
  }),
  component: IndexRedirect,
});


function IndexRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/gestione" : "/auth", replace: true });
    });
  }, []);
  return null;
}
