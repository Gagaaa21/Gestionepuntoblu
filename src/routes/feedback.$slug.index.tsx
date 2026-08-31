import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Star, Pencil, Quote, MessageSquare, BarChart3, ThumbsUp, ThumbsDown } from "lucide-react";
import logoAsset from "@/assets/logo-sogit.jpg.asset.json";

export const Route = createFileRoute("/feedback/$slug/")({
  head: () => ({
    meta: [
      { title: "Risposte pubbliche · S.O.G.IT." },
      { name: "description", content: "Leggi le valutazioni raccolte per questo servizio e lascia il tuo parere in due minuti." },
      { property: "og:title", content: "Risposte pubbliche · S.O.G.IT." },
      { property: "og:description", content: "Leggi le valutazioni raccolte per questo servizio e lascia il tuo parere in due minuti." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Risposte pubbliche · S.O.G.IT." },
      { name: "twitter:description", content: "Leggi le valutazioni raccolte per questo servizio e lascia il tuo parere in due minuti." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicResults,
});

type Survey = { id: string; slug: string; name: string; subject: string | null; description: string | null; public_results: boolean };
type Kind = "rating" | "single" | "multi" | "text" | "yesno";
type Question = { id: string; position: number; kind: Kind; label: string; options: string[] | null };
type Response = {
  id: string;
  respondent_name: string | null;
  privacy_consent: boolean;
  answers: { question_id: string; label: string; kind: Kind; value: any }[] | null;
  created_at: string;
};

function PublicResults() {
  const { slug } = Route.useParams();
  const [survey, setSurvey] = useState<Survey | null | undefined>(undefined);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [rows, setRows] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("surveys" as any)
        .select("id, slug, name, subject, description, public_results")
        .eq("slug", slug)
        .eq("active", true)
        .maybeSingle();
      if (!s) { setSurvey(null); setLoading(false); return; }
      setSurvey(s as any);
      const [q, r] = await Promise.all([
        supabase.from("survey_questions" as any).select("id, position, kind, label, options").eq("survey_id", (s as any).id).order("position", { ascending: true }),
        supabase.rpc("get_public_survey_responses" as any, { _slug: slug }),
      ]);
      setQuestions(((q.data as any) ?? []) as Question[]);
      setRows(((r.data as any) ?? []) as Response[]);
      setLoading(false);
    })();
  }, [slug]);

  const aggregates = useMemo(() => {
    return questions.map((q) => {
      const values = rows.map((r) => (r.answers ?? []).find((a) => a.question_id === q.id)?.value).filter((v) => v !== null && v !== undefined && v !== "");
      return { q, values };
    });
  }, [rows, questions]);

  const globalAvg = useMemo(() => {
    const ratings: number[] = [];
    for (const { q, values } of aggregates) {
      if (q.kind !== "rating") continue;
      for (const v of values) {
        const n = Number(v);
        if (n >= 1 && n <= 5) ratings.push(n);
      }
    }
    if (ratings.length === 0) return null;
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }, [aggregates]);

  const textAnswers = useMemo(() => {
    const list: { id: string; name: string; date: string; label: string; value: string }[] = [];
    for (const r of rows) {
      const displayName = r.privacy_consent && r.respondent_name ? r.respondent_name : "Anonimo";
      for (const a of r.answers ?? []) {
        if (a?.kind === "text" && typeof a.value === "string" && a.value.trim()) {
          list.push({ id: `${r.id}:${a.question_id}`, name: displayName, date: r.created_at, label: a.label, value: a.value.trim() });
        }
      }
    }
    return list;
  }, [rows]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--background)]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!survey) {
    return <div className="min-h-screen flex items-center justify-center px-4 text-sm text-muted-foreground">Questionario non trovato.</div>;
  }

  return (
    <div className="min-h-screen bg-[color:var(--background)]">
      {/* Editorial hero */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(1200px 400px at 50% -10%, color-mix(in oklab, var(--primary) 35%, transparent) 0%, transparent 60%), linear-gradient(180deg, color-mix(in oklab, var(--primary) 14%, var(--background)) 0%, var(--background) 100%)",
          }}
        />
        <div className="max-w-3xl mx-auto px-4 pt-10 pb-8 sm:pt-16 sm:pb-12 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white shadow-[0_10px_30px_-10px_rgba(15,27,61,0.35)] ring-1 ring-black/5 mb-5">
            <img src={logoAsset.url} alt="S.O.G.IT." className="h-12 w-12 sm:h-14 sm:w-14 rounded-full object-cover" />
          </div>
          <div className="eyebrow justify-center mb-3">Questionario di gradimento</div>
          <h1 className="font-serif text-[28px] leading-[1.05] sm:text-[52px] sm:leading-[1.02] font-semibold tracking-tight text-foreground px-1">
            {survey.name}
          </h1>
          {survey.subject && (
            <p className="serif-italic mt-3 text-lg sm:text-xl px-2">
              <span className="mr-1.5 text-muted-foreground/70">—</span>{survey.subject}
            </p>
          )}
          {survey.description && (
            <p className="mt-5 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed px-1">{survey.description}</p>
          )}

          {/* Global score */}
          {globalAvg !== null && (
            <div className="mt-8 mx-auto max-w-sm">
              <div className="rounded-2xl bg-card ring-1 ring-black/[0.06] shadow-[0_24px_60px_-30px_rgba(15,27,61,0.45)] px-6 py-6">
                <div className="eyebrow justify-center mb-2">Punteggio medio</div>
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="font-serif text-[56px] leading-none font-semibold text-foreground tabular">{globalAvg.toFixed(1)}</span>
                  <span className="text-muted-foreground text-sm tabular">/ 5</span>
                </div>
                <div className="mt-3 flex justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const fill = Math.max(0, Math.min(1, globalAvg - (n - 1)));
                    return (
                      <div key={n} className="relative h-5 w-5">
                        <Star className="absolute inset-0 h-5 w-5 text-yellow-400/25" />
                        <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                          <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">basato su <span className="tabular font-semibold text-foreground/80">{rows.length}</span> {rows.length === 1 ? "risposta" : "risposte"}</div>
              </div>
            </div>
          )}

          <Link to="/feedback/$slug/compila" params={{ slug: survey.slug }} className="block mt-7">
            <Button
              size="lg"
              className="w-full sm:w-auto sm:min-w-[300px] h-14 text-[15px] font-semibold tracking-wide shadow-[0_18px_38px_-14px_color-mix(in_oklab,var(--primary)_60%,transparent)] hover:shadow-[0_22px_46px_-12px_color-mix(in_oklab,var(--primary)_70%,transparent)] hover:-translate-y-0.5 transition-all"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Valuta questo servizio
            </Button>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-3 sm:px-6 pb-16 space-y-8">
        {/* Summary */}
        <section>
          <SectionHeader icon={<BarChart3 className="h-4 w-4" />} eyebrow="Riepilogo" title="Come è stato valutato" note={`${rows.length} ${rows.length === 1 ? "risposta" : "risposte"}`} />
          <div className="rounded-2xl bg-card ring-1 ring-black/5 shadow-sm divide-y divide-border/60">
            {aggregates.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">Nessun dato disponibile.</div>
            )}
            {aggregates.map(({ q, values }) => (
              <div key={q.id} className="p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="text-[15px] font-semibold text-foreground min-w-0">{q.label}</div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium shrink-0 mt-0.5">{values.length} · {q.kind === "rating" ? "voti" : "risposte"}</div>
                </div>
                <Aggregation q={q} values={values} />
              </div>
            ))}
          </div>
        </section>

        {/* Comments */}
        {textAnswers.length > 0 && (
          <section>
            <SectionHeader icon={<Quote className="h-4 w-4" />} eyebrow="Voci" title="Cosa dicono le persone" note={`${textAnswers.length} ${textAnswers.length === 1 ? "commento" : "commenti"}`} />
            <div className="grid gap-3 sm:grid-cols-2">
              {textAnswers.map((t) => (
                <figure key={t.id} className="relative rounded-2xl bg-card ring-1 ring-black/5 p-5 shadow-sm">
                  <Quote className="absolute -top-2 -left-2 h-8 w-8 text-primary/15" />
                  <blockquote className="font-serif text-[17px] leading-snug text-foreground/90">"{t.value}"</blockquote>
                  <figcaption className="mt-3 text-xs text-muted-foreground flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground/80">{t.name}</span>
                    <span>{new Date(t.date).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* Individual */}
        <section>
          <SectionHeader icon={<MessageSquare className="h-4 w-4" />} eyebrow="Trasparenza" title="Risposte individuali" />
          <p className="text-xs text-muted-foreground mb-3 -mt-2">I nomi vengono mostrati solo se il rispondente ha accettato la privacy. Altrimenti "Anonimo".</p>
          <div className="space-y-3">
            {rows.length === 0 && (
              <div className="rounded-2xl bg-card ring-1 ring-black/5 p-6 text-sm text-muted-foreground text-center">Ancora nessuna risposta.</div>
            )}
            {rows.map((r) => {
              const displayName = r.privacy_consent && r.respondent_name ? r.respondent_name : "Anonimo";
              const initials = displayName.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "A";
              return (
                <div key={r.id} className="rounded-2xl bg-card ring-1 ring-black/5 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border/60 bg-muted/30">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-semibold grid place-items-center ring-1 ring-primary/15">{initials}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground truncate">{displayName}</div>
                      <div className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  </div>
                  <div className="px-4 sm:px-5 py-3 space-y-1.5">
                    {(r.answers ?? []).filter((a: any) => a && a.question_id).map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground min-w-0 shrink-0 max-w-[45%] truncate">{a.label}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-foreground/90 min-w-0 flex-1"><AnswerValue kind={a.kind} value={a.value} /></span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ icon, eyebrow, title, note }: { icon: React.ReactNode; eyebrow: string; title: string; note?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="eyebrow mb-2">
          <span className="inline-flex items-center gap-1.5">{icon}<span>{eyebrow}</span></span>
        </div>
        <h2 className="font-serif text-[22px] sm:text-[28px] font-semibold tracking-tight text-foreground leading-[1.15]">{title}</h2>
      </div>
      {note && <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold shrink-0 pb-1 tabular">{note}</div>}
    </div>
  );
}

function AnswerValue({ kind, value }: { kind: Kind; value: any }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground italic">—</span>;
  if (kind === "rating") {
    const n = Number(value) || 0;
    return (
      <span className="inline-flex items-center gap-0.5 align-middle">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={`h-3.5 w-3.5 ${i < n ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
        ))}
      </span>
    );
  }
  if (kind === "yesno") {
    return value === "yes"
      ? <span className="inline-flex items-center gap-1 text-emerald-700 font-medium"><ThumbsUp className="h-3.5 w-3.5" />Sì</span>
      : <span className="inline-flex items-center gap-1 text-destructive font-medium"><ThumbsDown className="h-3.5 w-3.5" />No</span>;
  }
  if (kind === "multi") return <span>{(Array.isArray(value) ? value : []).join(", ")}</span>;
  return <span>{String(value)}</span>;
}

function Aggregation({ q, values }: { q: Question; values: any[] }) {
  if (values.length === 0) return <div className="text-xs text-muted-foreground italic">Nessuna risposta</div>;
  if (q.kind === "rating") {
    const nums = values.map(Number).filter((n) => n >= 1 && n <= 5);
    const avg = nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length);
    const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: nums.filter((x) => x === n).length }));
    return (
      <div>
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border/60">
          <div className="font-serif text-3xl font-semibold tabular-nums text-foreground">{avg.toFixed(2)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => {
                const fill = Math.max(0, Math.min(1, avg - (n - 1)));
                return (
                  <div key={n} className="relative h-4 w-4">
                    <Star className="absolute inset-0 h-4 w-4 text-yellow-400/30" />
                    <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">su 5 · {nums.length} voti</div>
          </div>
        </div>
        <div className="space-y-1.5">
          {dist.map((d) => <Bar key={d.n} label={<span className="inline-flex items-center gap-0.5">{d.n}<Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /></span>} count={d.c} total={nums.length} accent="star" />)}
        </div>
      </div>
    );
  }
  if (q.kind === "yesno") {
    const yes = values.filter((v) => v === "yes").length;
    const no = values.filter((v) => v === "no").length;
    return (
      <div className="space-y-1.5">
        <Bar label={<span className="inline-flex items-center gap-1 text-emerald-700"><ThumbsUp className="h-3 w-3" />Sì</span>} count={yes} total={values.length} accent="yes" />
        <Bar label={<span className="inline-flex items-center gap-1 text-destructive"><ThumbsDown className="h-3 w-3" />No</span>} count={no} total={values.length} accent="no" />
      </div>
    );
  }
  if (q.kind === "single" || q.kind === "multi") {
    const flat = q.kind === "multi" ? values.flatMap((v) => Array.isArray(v) ? v : []) : values;
    const opts = q.options ?? Array.from(new Set(flat.map(String)));
    const denom = q.kind === "multi" ? values.length : flat.length;
    return (
      <div className="space-y-1.5">
        {opts.map((o) => <Bar key={o} label={o} count={flat.filter((x) => x === o).length} total={denom} />)}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {values.map((v, i) => (
        <li key={i} className="pl-3 border-l-2 border-primary/30 text-sm text-foreground/85 italic">"{String(v)}"</li>
      ))}
    </ul>
  );
}

function Bar({ label, count, total, accent = "primary" }: { label: React.ReactNode; count: number; total: number; accent?: "primary" | "star" | "yes" | "no" }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const bg =
    accent === "star" ? "linear-gradient(90deg, #fbbf24, #f59e0b)"
    : accent === "yes" ? "linear-gradient(90deg, #10b981, #059669)"
    : accent === "no" ? "linear-gradient(90deg, #ef4444, #dc2626)"
    : "linear-gradient(90deg, color-mix(in oklab, var(--primary) 85%, white), var(--primary))";
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="w-20 sm:w-24 shrink-0 text-foreground/80 font-medium truncate">{label}</div>
      <div className="flex-1 h-2.5 bg-muted/70 rounded-full overflow-hidden ring-1 ring-inset ring-black/[0.03]">
        <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, background: bg }} />
      </div>
      <div className="w-16 shrink-0 text-right tabular-nums text-muted-foreground"><span className="font-semibold text-foreground">{count}</span> · {pct}%</div>
    </div>
  );
}
