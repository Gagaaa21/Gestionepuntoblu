import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callAiGateway } from "./ai-gateway.server";

const MODEL = "google/gemini-2.5-flash";

const input = z.object({ surveyId: z.string().uuid() });

type Theme = { title: string; sentiment: "positive" | "negative" | "neutral"; count: number; quote: string | null };

export const analyzeSurveyThemes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { surveyId } = data;

    // Autorizzazione: solo admin/developer possono analizzare
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "developer");
    if (!isAdmin) throw new Error("Non autorizzato.");

    const { data: rows, error } = await context.supabase
      .from("survey_responses")
      .select("answers, created_at")
      .eq("survey_id", surveyId)
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) throw new Error("Errore nel caricamento risposte.");

    // Estrai commenti testuali (kind: text) non vuoti
    const comments: string[] = [];
    for (const r of rows ?? []) {
      const answers = Array.isArray((r as any).answers) ? (r as any).answers : [];
      for (const a of answers) {
        if (a?.kind === "text" && typeof a.value === "string") {
          const v = a.value.trim();
          if (v.length >= 3) comments.push(v.slice(0, 500));
        }
      }
    }

    if (comments.length === 0) {
      return { themes: [] as Theme[], commentsAnalyzed: 0 };
    }

    const messages = [
      {
        role: "system" as const,
        content:
          "Sei un analista che riceve commenti liberi da un questionario di gradimento (italiano) e restituisce i temi ricorrenti. " +
          "Rispondi SOLO con JSON valido, senza testo fuori dal JSON e senza markdown. " +
          'Schema: {"themes":[{"title":"...", "sentiment":"positive"|"negative"|"neutral", "count":N, "quote":"..."}]}. ' +
          "Regole: massimo 5 temi, ordinati per rilevanza (count discendente). Il titolo è breve (2-6 parole). " +
          "\"count\" è il numero approssimato di commenti che toccano quel tema. \"quote\" è una citazione rappresentativa breve (max 120 caratteri) presa dai commenti, oppure null. " +
          "Se non ci sono temi chiari, restituisci un array vuoto.",
      },
      {
        role: "user" as const,
        content: `Analizza questi ${comments.length} commenti:\n\n` + comments.map((c, i) => `${i + 1}. ${c}`).join("\n"),
      },
    ];

    const raw: string = await callAiGateway(messages, { model: MODEL, temperature: 0.2 });
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let themes: Theme[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed?.themes)) {
        themes = parsed.themes.slice(0, 5).map((t: any) => ({
          title: String(t.title ?? "").slice(0, 80),
          sentiment: t.sentiment === "positive" || t.sentiment === "negative" ? t.sentiment : "neutral",
          count: Math.max(1, Math.min(comments.length, Number(t.count) || 1)),
          quote: typeof t.quote === "string" && t.quote.trim() ? t.quote.trim().slice(0, 140) : null,
        }));
      }
    } catch {
      themes = [];
    }

    return { themes, commentsAnalyzed: comments.length };
  });
