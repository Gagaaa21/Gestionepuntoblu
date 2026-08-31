import { createServerFn } from "@tanstack/react-start";
import { callAiGateway } from "./ai-gateway.server";
import { getAiApiKey } from "./ai-config.server";
import { z } from "zod";

const MODEL = "google/gemini-2.5-flash";

const input = z.object({
  slug: z.string().min(1),
  target: z.enum(["it", "en", "de", "fr", "es", "sl", "hr", "nl"]),
});

const LANG_NAMES: Record<string, string> = {
  it: "Italian", en: "English", de: "German", fr: "French",
  es: "Spanish", sl: "Slovenian", hr: "Croatian", nl: "Dutch",
};

export type SurveyTranslation = {
  name: string;
  subject: string | null;
  description: string | null;
  privacy_text: string | null;
  questions: { id: string; label: string; options: string[] | null }[];
};

export const translateSurvey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<SurveyTranslation | null> => {
    const { slug, target } = data;
    if (target === "it") return null; // no translation needed

    // Use service-role client to read public survey content (bypass RLS on server)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin
      .from("surveys" as any)
      .select("id, name, subject, description, privacy_text")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    if (!s) return null;
    const surveyId = (s as any).id as string;

    const { data: qs } = await supabaseAdmin
      .from("survey_questions" as any)
      .select("id, position, label, options")
      .eq("survey_id", surveyId)
      .eq("active", true)
      .order("position", { ascending: true });

    const questions = ((qs as any[]) ?? []).map((q) => ({
      id: q.id as string,
      label: (q.label ?? "") as string,
      options: (Array.isArray(q.options) ? q.options : null) as string[] | null,
    }));

    const payload = {
      name: (s as any).name ?? "",
      subject: (s as any).subject ?? null,
      description: (s as any).description ?? null,
      privacy_text: (s as any).privacy_text ?? null,
      questions,
    };

    const apiKey = getAiApiKey();
    if (!apiKey) return payload;

    const sys =
      `You translate survey content from Italian to ${LANG_NAMES[target]}. ` +
      `Return ONLY valid JSON with the EXACT same shape and keys as the input, ` +
      `translating every human-readable string value (name, subject, description, privacy_text, question labels, and each option). ` +
      `Preserve every "id" field verbatim. Keep null values as null. Do not add or remove keys. No markdown, no commentary.`;

    let raw = "";
    try {
      raw = await callAiGateway(
        [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(payload) },
        ],
        { model: MODEL, temperature: 0.2, timeoutMs: 25_000 },
      );
    } catch {
      return payload; // Traduzione non disponibile: mostra il testo originale
    }
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      // Merge safely, keeping original ids and option counts
      const outQuestions = questions.map((orig) => {
        const tr = Array.isArray(parsed.questions) ? parsed.questions.find((x: any) => x?.id === orig.id) : null;
        const label = typeof tr?.label === "string" && tr.label.trim() ? tr.label : orig.label;
        let options: string[] | null = orig.options;
        if (Array.isArray(orig.options) && Array.isArray(tr?.options) && tr.options.length === orig.options.length) {
          options = tr.options.map((o: any, i: number) => (typeof o === "string" && o.trim() ? o : orig.options![i]));
        }
        return { id: orig.id, label, options };
      });
      return {
        name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : payload.name,
        subject: typeof parsed.subject === "string" ? parsed.subject : payload.subject,
        description: typeof parsed.description === "string" ? parsed.description : payload.description,
        privacy_text: typeof parsed.privacy_text === "string" ? parsed.privacy_text : payload.privacy_text,
        questions: outQuestions,
      };
    } catch {
      return payload;
    }
  });
