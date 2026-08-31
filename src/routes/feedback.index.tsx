import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowRight, Sparkles } from "lucide-react";
import logoAsset from "@/assets/logo-sogit.jpg.asset.json";

export const Route = createFileRoute("/feedback/")({
  head: () => ({
    meta: [
      { title: "Il tuo parere conta · S.O.G.IT. Lignano Sabbiadoro" },
      { name: "description", content: "Scegli il servizio che vuoi valutare e aiutaci a migliorarlo. Bastano due minuti." },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app/feedback/" },
      { property: "og:title", content: "Il tuo parere conta · S.O.G.IT. Lignano Sabbiadoro" },
      { property: "og:description", content: "Scegli il servizio che vuoi valutare e aiutaci a migliorarlo. Bastano due minuti." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Il tuo parere conta · S.O.G.IT. Lignano Sabbiadoro" },
      { name: "twitter:description", content: "Scegli il servizio che vuoi valutare e aiutaci a migliorarlo. Bastano due minuti." },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app/feedback/" }],
  }),
  component: FeedbackIndex,
});

type Survey = {
  id: string;
  slug: string;
  name: string;
  subject: string | null;
  description: string | null;
};

function FeedbackIndex() {
  const [surveys, setSurveys] = useState<Survey[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("surveys" as any)
        .select("id, slug, name, subject, description")
        .eq("active", true)
        .order("created_at", { ascending: true });
      setSurveys(((data as any) ?? []) as Survey[]);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[color:var(--background)]">
      {/* Hero editoriale */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(1200px 400px at 50% -10%, color-mix(in oklab, var(--primary) 35%, transparent) 0%, transparent 60%), linear-gradient(180deg, color-mix(in oklab, var(--primary) 14%, var(--background)) 0%, var(--background) 100%)",
          }}
        />
        <div className="max-w-2xl mx-auto px-4 pt-10 pb-8 sm:pt-16 sm:pb-12 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white shadow-[0_10px_30px_-10px_rgba(15,27,61,0.35)] ring-1 ring-black/5 mb-5">
            <img src={logoAsset.url} alt="S.O.G.IT." className="h-12 w-12 sm:h-14 sm:w-14 rounded-full object-cover" />
          </div>
          <div className="eyebrow justify-center mb-3">Il tuo parere conta</div>
          <h1 className="font-serif text-[30px] leading-[1.05] sm:text-[52px] sm:leading-[1.02] font-semibold tracking-tight text-foreground px-1">
            Scegli cosa vuoi valutare
          </h1>
          <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-lg mx-auto leading-relaxed px-1">
            Ci bastano un paio di minuti. Ogni voto ci aiuta a migliorare i servizi che offriamo al territorio.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-3 sm:px-4 pb-16">
        {!surveys ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : surveys.length === 0 ? (
          <div className="rounded-2xl bg-card ring-1 ring-black/5 shadow-sm p-8 text-center">
            <Sparkles className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nessun questionario attivo al momento.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {surveys.map((s, i) => (
              <Link
                key={s.id}
                to="/feedback/$slug"
                params={{ slug: s.slug }}
                className="group block rounded-2xl bg-card ring-1 ring-black/5 shadow-sm p-5 sm:p-6 hover:ring-primary/30 hover:shadow-[0_20px_40px_-24px_color-mix(in_oklab,var(--primary)_55%,transparent)] hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="shrink-0 h-11 w-11 rounded-full bg-primary/8 ring-1 ring-primary/15 grid place-items-center font-serif text-primary text-lg font-semibold tabular-nums">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-xl leading-tight font-semibold text-foreground truncate">{s.name}</div>
                    {s.subject && <div className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">{s.subject}</div>}
                    {s.description && <p className="hidden sm:block text-xs text-muted-foreground/80 mt-1.5 line-clamp-2">{s.description}</p>}
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
          S.O.G.IT. Croce di San Giovanni ODV · Sezione di Lignano Sabbiadoro
        </p>
      </div>
    </div>
  );
}
