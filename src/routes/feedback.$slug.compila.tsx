import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, CheckCircle2, Loader2, Heart, Languages, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import logoAsset from "@/assets/logo-sogit.jpg.asset.json";
import { translateSurvey, type SurveyTranslation } from "@/lib/api/survey-translate.functions";

export const Route = createFileRoute("/feedback/$slug/compila")({
  head: () => ({
    meta: [
      { title: "Compila il questionario · S.O.G.IT." },
      { name: "description", content: "Compila il breve questionario di gradimento — bastano un paio di minuti." },
      { property: "og:title", content: "Compila il questionario · S.O.G.IT." },
      { property: "og:description", content: "Compila il breve questionario di gradimento — bastano un paio di minuti." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Compila il questionario · S.O.G.IT." },
      { name: "twitter:description", content: "Compila il breve questionario di gradimento — bastano un paio di minuti." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FeedbackPage,
});

type Survey = {
  id: string;
  slug: string;
  name: string;
  subject: string | null;
  description: string | null;
  public_results: boolean;
  privacy_text: string | null;
  privacy_required: boolean;
};

type Question = {
  id: string;
  position: number;
  kind: "rating" | "single" | "multi" | "text" | "yesno";
  label: string;
  options: string[] | null;
  required: boolean;
};

type LangCode = "it" | "en" | "de" | "fr" | "es" | "sl" | "hr" | "nl";

const LANGUAGES: { code: LangCode; label: string; flag: string }[] = [
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "sl", label: "Slovenščina", flag: "🇸🇮" },
  { code: "hr", label: "Hrvatski", flag: "🇭🇷" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
];

const T: Record<LangCode, {
  evaluating: string; nameCard: string; optional: string; required: string;
  namePlaceholder: string; nameDesc: string; textCommentDesc: string; textPlaceholder: string;
  yes: string; no: string; submit: string; submitting: string; missing: string;
  errorLoad: string; errorSubmit: string; thanks: string; thanksMsg: string;
  noQuestions: string; noQuestionsMsg: string; footerNote: string; language: string;
  privacyTitle: string; privacyDesc: string; privacyLabel: string; mustAcceptPrivacy: string;
  viewResults: string; notFound: string; starAria: (n: number) => string;
}> = {
  it: { evaluating: "Stai valutando", nameCard: "Il tuo nome", optional: "Facoltativo", required: "Obbligatoria", namePlaceholder: "(facoltativo) Come ti chiami?", nameDesc: "Il nome viene mostrato pubblicamente SOLO se accetti la privacy qui sotto. Altrimenti resterai anonimo.", textCommentDesc: "Un commento è ben accetto ma non obbligatorio.", textPlaceholder: "Scrivi qui…", yes: "Sì", no: "No", submit: "Invia risposta", submitting: "Invio…", missing: "Rispondi alle domande obbligatorie", errorLoad: "Impossibile caricare il questionario", errorSubmit: "Invio non riuscito: ", thanks: "Grazie!", thanksMsg: "Il tuo parere ci aiuta a migliorare ogni giorno.", noQuestions: "Nessuna domanda disponibile", noQuestionsMsg: "Il questionario non è al momento attivo.", footerNote: "Le risposte sono pubbliche in forma anonima; il nome viene mostrato solo se hai accettato la privacy.", language: "Lingua", privacyTitle: "Informativa privacy", privacyDesc: "I dati raccolti sono trattati per finalità di valutazione del servizio. Puoi rispondere in forma anonima. Se accetti, il tuo nome sarà mostrato accanto alla risposta.", privacyLabel: "Ho letto l'informativa e acconsento alla pubblicazione del mio nome accanto alla risposta.", mustAcceptPrivacy: "", viewResults: "Vedi risposte pubbliche", notFound: "Questionario non trovato", starAria: (n) => `${n} stelle` },
  en: { evaluating: "You're rating", nameCard: "Your name", optional: "Optional", required: "Required", namePlaceholder: "(optional) What's your name?", nameDesc: "Your name will be shown publicly ONLY if you accept the privacy notice below. Otherwise you stay anonymous.", textCommentDesc: "A comment is welcome but not required.", textPlaceholder: "Write here…", yes: "Yes", no: "No", submit: "Submit response", submitting: "Sending…", missing: "Please answer the required questions", errorLoad: "Unable to load the survey", errorSubmit: "Submission failed: ", thanks: "Thank you!", thanksMsg: "Your feedback helps us improve every day.", noQuestions: "No questions available", noQuestionsMsg: "The survey is not active right now.", footerNote: "Responses are shown publicly anonymized; your name is shown only if you accepted the privacy notice.", language: "Language", privacyTitle: "Privacy notice", privacyDesc: "Data is processed to evaluate the service. You may reply anonymously. If you accept, your name will be shown next to your response.", privacyLabel: "I have read the notice and consent to publish my name next to my response.", mustAcceptPrivacy: "", viewResults: "View public responses", notFound: "Survey not found", starAria: (n) => `${n} stars` },
  de: { evaluating: "Sie bewerten", nameCard: "Ihr Name", optional: "Optional", required: "Pflichtfeld", namePlaceholder: "(optional) Wie heißen Sie?", nameDesc: "Ihr Name wird nur öffentlich angezeigt, wenn Sie die Datenschutzerklärung unten akzeptieren. Andernfalls bleiben Sie anonym.", textCommentDesc: "Ein Kommentar ist willkommen, aber nicht erforderlich.", textPlaceholder: "Hier schreiben…", yes: "Ja", no: "Nein", submit: "Antwort senden", submitting: "Senden…", missing: "Bitte beantworten Sie die Pflichtfragen", errorLoad: "Fragebogen konnte nicht geladen werden", errorSubmit: "Übermittlung fehlgeschlagen: ", thanks: "Danke!", thanksMsg: "Ihre Rückmeldung hilft uns, uns täglich zu verbessern.", noQuestions: "Keine Fragen verfügbar", noQuestionsMsg: "Der Fragebogen ist derzeit nicht aktiv.", footerNote: "Antworten sind anonym öffentlich; Ihr Name wird nur bei Zustimmung angezeigt.", language: "Sprache", privacyTitle: "Datenschutzhinweis", privacyDesc: "Die Daten werden zur Bewertung des Dienstes verarbeitet. Sie können anonym antworten. Bei Zustimmung wird Ihr Name neben Ihrer Antwort angezeigt.", privacyLabel: "Ich habe den Hinweis gelesen und stimme der Veröffentlichung meines Namens zu.", mustAcceptPrivacy: "", viewResults: "Öffentliche Antworten ansehen", notFound: "Fragebogen nicht gefunden", starAria: (n) => `${n} Sterne` },
  fr: { evaluating: "Vous évaluez", nameCard: "Votre nom", optional: "Facultatif", required: "Obligatoire", namePlaceholder: "(facultatif) Comment vous appelez-vous ?", nameDesc: "Votre nom sera affiché publiquement UNIQUEMENT si vous acceptez la politique de confidentialité ci-dessous.", textCommentDesc: "Un commentaire est bienvenu mais pas obligatoire.", textPlaceholder: "Écrivez ici…", yes: "Oui", no: "Non", submit: "Envoyer la réponse", submitting: "Envoi…", missing: "Veuillez répondre aux questions obligatoires", errorLoad: "Impossible de charger le questionnaire", errorSubmit: "Échec de l'envoi : ", thanks: "Merci !", thanksMsg: "Votre retour nous aide à nous améliorer chaque jour.", noQuestions: "Aucune question disponible", noQuestionsMsg: "Le questionnaire n'est pas actif actuellement.", footerNote: "Les réponses sont publiques anonymisées ; votre nom n'apparaît qu'avec votre consentement.", language: "Langue", privacyTitle: "Avis de confidentialité", privacyDesc: "Les données sont traitées pour évaluer le service. Vous pouvez répondre anonymement. Avec votre accord, votre nom sera affiché.", privacyLabel: "J'ai lu l'avis et je consens à la publication de mon nom à côté de ma réponse.", mustAcceptPrivacy: "", viewResults: "Voir les réponses publiques", notFound: "Questionnaire introuvable", starAria: (n) => `${n} étoiles` },
  es: { evaluating: "Estás valorando", nameCard: "Tu nombre", optional: "Opcional", required: "Obligatoria", namePlaceholder: "(opcional) ¿Cómo te llamas?", nameDesc: "Tu nombre se mostrará públicamente SOLO si aceptas el aviso de privacidad. De lo contrario, permanecerás anónimo.", textCommentDesc: "Un comentario es bienvenido pero no obligatorio.", textPlaceholder: "Escribe aquí…", yes: "Sí", no: "No", submit: "Enviar respuesta", submitting: "Enviando…", missing: "Responde a las preguntas obligatorias", errorLoad: "No se pudo cargar el cuestionario", errorSubmit: "Envío fallido: ", thanks: "¡Gracias!", thanksMsg: "Tu opinión nos ayuda a mejorar cada día.", noQuestions: "No hay preguntas disponibles", noQuestionsMsg: "El cuestionario no está activo en este momento.", footerNote: "Las respuestas son públicas y anónimas; tu nombre solo se muestra si has aceptado el aviso.", language: "Idioma", privacyTitle: "Aviso de privacidad", privacyDesc: "Los datos se tratan para evaluar el servicio. Puedes responder de forma anónima. Si aceptas, tu nombre aparecerá junto a la respuesta.", privacyLabel: "He leído el aviso y consiento la publicación de mi nombre junto a mi respuesta.", mustAcceptPrivacy: "", viewResults: "Ver respuestas públicas", notFound: "Cuestionario no encontrado", starAria: (n) => `${n} estrellas` },
  sl: { evaluating: "Ocenjujete", nameCard: "Vaše ime", optional: "Neobvezno", required: "Obvezno", namePlaceholder: "(neobvezno) Kako vam je ime?", nameDesc: "Vaše ime bo javno prikazano SAMO, če sprejmete obvestilo o zasebnosti spodaj.", textCommentDesc: "Komentar je dobrodošel, a ni obvezen.", textPlaceholder: "Pišite tukaj…", yes: "Da", no: "Ne", submit: "Pošlji odgovor", submitting: "Pošiljanje…", missing: "Odgovorite na obvezna vprašanja", errorLoad: "Vprašalnika ni mogoče naložiti", errorSubmit: "Pošiljanje ni uspelo: ", thanks: "Hvala!", thanksMsg: "Vaše mnenje nam pomaga, da se izboljšujemo vsak dan.", noQuestions: "Ni razpoložljivih vprašanj", noQuestionsMsg: "Vprašalnik trenutno ni aktiven.", footerNote: "Odgovori so javno prikazani anonimno; vaše ime je prikazano samo z vašim soglasjem.", language: "Jezik", privacyTitle: "Obvestilo o zasebnosti", privacyDesc: "Podatki se obdelujejo za oceno storitve. Odgovorite lahko anonimno. Z vašim soglasjem bo vaše ime prikazano ob odgovoru.", privacyLabel: "Prebral sem obvestilo in soglašam z objavo svojega imena ob odgovoru.", mustAcceptPrivacy: "", viewResults: "Ogled javnih odgovorov", notFound: "Vprašalnika ni bilo mogoče najti", starAria: (n) => `${n} zvezdic` },
  hr: { evaluating: "Ocjenjujete", nameCard: "Vaše ime", optional: "Neobavezno", required: "Obavezno", namePlaceholder: "(neobavezno) Kako se zovete?", nameDesc: "Vaše ime bit će javno prikazano SAMO ako prihvatite obavijest o privatnosti ispod.", textCommentDesc: "Komentar je dobrodošao, ali nije obavezan.", textPlaceholder: "Pišite ovdje…", yes: "Da", no: "Ne", submit: "Pošalji odgovor", submitting: "Slanje…", missing: "Odgovorite na obavezna pitanja", errorLoad: "Nije moguće učitati upitnik", errorSubmit: "Slanje nije uspjelo: ", thanks: "Hvala!", thanksMsg: "Vaše mišljenje nam pomaže da se poboljšavamo svaki dan.", noQuestions: "Nema dostupnih pitanja", noQuestionsMsg: "Upitnik trenutno nije aktivan.", footerNote: "Odgovori su javni i anonimni; ime se prikazuje samo uz vašu suglasnost.", language: "Jezik", privacyTitle: "Obavijest o privatnosti", privacyDesc: "Podaci se obrađuju u svrhu ocjene usluge. Možete odgovoriti anonimno. Uz vaš pristanak, vaše će ime biti prikazano uz odgovor.", privacyLabel: "Pročitao/la sam obavijest i pristajem na objavu svog imena uz odgovor.", mustAcceptPrivacy: "", viewResults: "Prikaži javne odgovore", notFound: "Upitnik nije pronađen", starAria: (n) => `${n} zvjezdica` },
  nl: { evaluating: "U beoordeelt", nameCard: "Uw naam", optional: "Optioneel", required: "Verplicht", namePlaceholder: "(optioneel) Hoe heet u?", nameDesc: "Uw naam wordt ALLEEN publiek getoond als u de privacyverklaring hieronder accepteert.", textCommentDesc: "Een opmerking is welkom maar niet verplicht.", textPlaceholder: "Schrijf hier…", yes: "Ja", no: "Nee", submit: "Antwoord verzenden", submitting: "Verzenden…", missing: "Beantwoord de verplichte vragen", errorLoad: "Kan de enquête niet laden", errorSubmit: "Verzending mislukt: ", thanks: "Bedankt!", thanksMsg: "Uw feedback helpt ons elke dag te verbeteren.", noQuestions: "Geen vragen beschikbaar", noQuestionsMsg: "De enquête is momenteel niet actief.", footerNote: "Antwoorden zijn openbaar en anoniem; uw naam wordt alleen getoond bij toestemming.", language: "Taal", privacyTitle: "Privacyverklaring", privacyDesc: "Gegevens worden verwerkt om de dienst te evalueren. U kunt anoniem antwoorden. Met uw toestemming wordt uw naam bij het antwoord getoond.", privacyLabel: "Ik heb de verklaring gelezen en stem in met publicatie van mijn naam bij mijn antwoord.", mustAcceptPrivacy: "", viewResults: "Openbare antwoorden bekijken", notFound: "Enquête niet gevonden", starAria: (n) => `${n} sterren` },
};

function detectLang(): LangCode {
  if (typeof window === "undefined") return "it";
  const saved = window.localStorage.getItem("feedback:lang") as LangCode | null;
  if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  const nav = (navigator.language || "it").slice(0, 2).toLowerCase();
  const match = LANGUAGES.find((l) => l.code === nav);
  return (match?.code ?? "it") as LangCode;
}

const NAME_T: Record<string, { badge: string; ph: string; desc: string; toggle: string; anon: string; missingName: string }> = {
  it: { badge: "Obbligatorio", ph: "Nome o nickname", desc: "Serve un nome o un nickname: puoi decidere tu se mostrarlo pubblicamente oppure restare anonimo.", toggle: "Mostra pubblicamente il mio nome accanto alla risposta", anon: "La risposta sarà pubblicata come «Anonimo».", missingName: "Inserisci un nome o un nickname" },
  en: { badge: "Required", ph: "Name or nickname", desc: "A name or nickname is required: you choose whether to show it publicly or stay anonymous.", toggle: "Show my name publicly next to my response", anon: "Your response will be published as “Anonymous”.", missingName: "Please enter a name or nickname" },
  de: { badge: "Pflichtfeld", ph: "Name oder Spitzname", desc: "Ein Name oder Spitzname ist erforderlich: Sie entscheiden, ob er öffentlich angezeigt wird.", toggle: "Meinen Namen öffentlich neben der Antwort anzeigen", anon: "Ihre Antwort wird als „Anonym“ veröffentlicht.", missingName: "Bitte Name oder Spitzname eingeben" },
  fr: { badge: "Obligatoire", ph: "Nom ou pseudo", desc: "Un nom ou pseudo est requis : vous choisissez de l'afficher publiquement ou de rester anonyme.", toggle: "Afficher publiquement mon nom à côté de ma réponse", anon: "Votre réponse sera publiée comme « Anonyme ».", missingName: "Veuillez saisir un nom ou un pseudo" },
  es: { badge: "Obligatorio", ph: "Nombre o apodo", desc: "Se requiere un nombre o apodo: tú decides si mostrarlo públicamente o permanecer anónimo.", toggle: "Mostrar públicamente mi nombre junto a la respuesta", anon: "Tu respuesta se publicará como «Anónimo».", missingName: "Introduce un nombre o apodo" },
  sl: { badge: "Obvezno", ph: "Ime ali vzdevek", desc: "Ime ali vzdevek je obvezen: sami izberete, ali bo javno prikazan.", toggle: "Javno prikaži moje ime ob odgovoru", anon: "Odgovor bo objavljen kot »Anonimno«.", missingName: "Vnesite ime ali vzdevek" },
  hr: { badge: "Obavezno", ph: "Ime ili nadimak", desc: "Ime ili nadimak je obavezan: sami birate hoće li biti javno prikazan.", toggle: "Javno prikaži moje ime uz odgovor", anon: "Odgovor će biti objavljen kao „Anonimno”.", missingName: "Unesite ime ili nadimak" },
  nl: { badge: "Verplicht", ph: "Naam of bijnaam", desc: "Een naam of bijnaam is verplicht: u kiest of deze openbaar wordt getoond.", toggle: "Toon mijn naam openbaar naast mijn reactie", anon: "Uw reactie wordt gepubliceerd als “Anoniem”.", missingName: "Voer een naam of bijnaam in" },
};

function FeedbackPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<Survey | null | undefined>(undefined);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [name, setName] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [publicName, setPublicName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [lang, setLang] = useState<LangCode>("it");
  const [translation, setTranslation] = useState<SurveyTranslation | null>(null);
  const [translating, setTranslating] = useState(false);
  const t = T[lang];
  const nt = NAME_T[lang] ?? NAME_T.it;

  useEffect(() => { setLang(detectLang()); }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("feedback:lang", lang);
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  // Auto-translate dynamic content (name, subject, description, questions, options) on lang change
  useEffect(() => {
    let cancelled = false;
    if (lang === "it") { setTranslation(null); return; }
    const cacheKey = `feedback:tr:${slug}:${lang}`;
    if (typeof window !== "undefined") {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached) {
        try { setTranslation(JSON.parse(cached)); return; } catch {}
      }
    }
    setTranslating(true);
    translateSurvey({ data: { slug, target: lang } })
      .then((tr) => {
        if (cancelled) return;
        setTranslation(tr);
        if (tr && typeof window !== "undefined") {
          try { window.sessionStorage.setItem(cacheKey, JSON.stringify(tr)); } catch {}
        }
      })
      .catch(() => { if (!cancelled) setTranslation(null); })
      .finally(() => { if (!cancelled) setTranslating(false); });
    return () => { cancelled = true; };
  }, [lang, slug]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("surveys" as any)
        .select("id, slug, name, subject, description, public_results, privacy_text, privacy_required")
        .eq("slug", slug)
        .eq("active", true)
        .maybeSingle();
      if (!s) { setSurvey(null); setLoading(false); return; }
      setSurvey(s as any);
      const { data: q } = await supabase
        .from("survey_questions" as any)
        .select("id, position, kind, label, options, required")
        .eq("survey_id", (s as any).id)
        .eq("active", true)
        .order("position", { ascending: true });
      setQuestions(((q as any) ?? []) as Question[]);
      setLoading(false);
    })();
  }, [slug]);

  const canSubmit = useMemo(() => {
    if (name.trim().length < 2) return false;
    if (survey?.privacy_required && !privacy) return false;
    for (const q of questions) {
      if (!q.required) continue;
      const v = answers[q.id];
      if (q.kind === "multi") { if (!Array.isArray(v) || v.length === 0) return false; }
      else if (q.kind === "rating") { if (!v || v < 1) return false; }
      else if (v === undefined || v === null || v === "") return false;
    }
    return true;
  }, [questions, answers, survey, privacy, name]);

  // Displayed (possibly translated) survey + questions
  const displaySurvey = useMemo(() => {
    if (!survey || !translation) return survey;
    return {
      ...survey,
      name: translation.name || survey.name,
      subject: translation.subject ?? survey.subject,
      description: translation.description ?? survey.description,
      privacy_text: translation.privacy_text ?? survey.privacy_text,
    };
  }, [survey, translation]);
  const displayQuestions = useMemo(() => {
    if (!translation) return questions;
    const map = new Map(translation.questions.map((q) => [q.id, q] as const));
    return questions.map((q) => {
      const tr = map.get(q.id);
      if (!tr) return q;
      return { ...q, label: tr.label || q.label, options: tr.options ?? q.options };
    });
  }, [questions, translation]);

  async function submit() {
    if (name.trim().length < 2) { toast.error(nt.missingName); return; }
    if (!canSubmit) { toast.error(t.missing); return; }
    if (!survey) return;
    setSubmitting(true);
    const labeled = questions.map((q) => ({
      question_id: q.id, label: q.label, kind: q.kind, value: answers[q.id] ?? null,
    }));
    const labeledWithLang = [{ meta: "language", lang }, ...labeled];
    const { error } = await supabase.rpc("submit_survey_response" as any, {
      _survey_id: survey.id,
      _name: name.trim() || null,
      _answers: labeledWithLang as any,
      _privacy_consent: publicName && (survey.privacy_required ? privacy : true),
    } as any);
    setSubmitting(false);
    if (error) { toast.error(t.errorSubmit + error.message); return; }
    setDone(true);
  }

  const LangPicker = (
    <div className="flex justify-end">
      <Select value={lang} onValueChange={(v) => setLang(v as LangCode)}>
        <SelectTrigger className="w-auto min-w-[10rem] h-9 gap-2">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {LANGUAGES.map((l) => (
            <SelectItem key={l.code} value={l.code}>
              <span className="mr-2">{l.flag}</span>{l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  if (loading || survey === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (survey === null) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-2">
            <h1 className="text-xl font-semibold">{t.notFound}</h1>
            <p className="text-sm text-muted-foreground">{t.noQuestionsMsg}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-linear-to-b from-background to-muted/40">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-3">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Heart className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold">{t.thanks}</h1>
            <p className="text-muted-foreground">{t.thanksMsg}</p>
            {survey.public_results && (
              <Button variant="outline" className="mt-2" onClick={() => navigate({ to: "/feedback/$slug", params: { slug: survey.slug } })}>
                <BarChart3 className="h-4 w-4 mr-2" />{t.viewResults}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalQ = questions.length;
  const answeredQ = questions.filter((q) => {
    const v = answers[q.id];
    if (q.kind === "multi") return Array.isArray(v) && v.length > 0;
    if (q.kind === "rating") return v && v >= 1;
    return v !== undefined && v !== null && v !== "";
  }).length;
  const progress = totalQ > 0 ? Math.round((answeredQ / totalQ) * 100) : 0;
  const sv = displaySurvey!;

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
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 sm:pt-10 sm:pb-10">
          <div className="flex justify-end mb-4">{LangPicker}</div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white shadow-[0_10px_30px_-10px_rgba(15,27,61,0.35)] ring-1 ring-black/5 mb-4">
              <img src={logoAsset.url} alt="S.O.G.IT." className="h-12 w-12 sm:h-14 sm:w-14 rounded-full object-cover" />
            </div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-primary/80 font-semibold mb-2 inline-flex items-center gap-2">
              <span>Questionario di gradimento</span>
              {translating && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            <h1 className="font-serif text-[26px] leading-[1.1] sm:text-5xl sm:leading-[1.05] font-semibold tracking-tight text-foreground px-1">
              {sv.name}
            </h1>
            {sv.subject && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur ring-1 ring-primary/15 text-xs sm:text-sm">
                <span className="text-muted-foreground">{t.evaluating}:</span>
                <span className="font-semibold text-foreground">{sv.subject}</span>
              </div>
            )}
            {sv.description && (
              <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed px-1">{sv.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-3 sm:px-4 pb-16">
        {questions.length === 0 ? (
          <div className="rounded-2xl bg-card ring-1 ring-black/5 shadow-sm p-8 text-center space-y-2">
            <h2 className="font-serif text-2xl font-semibold">{t.noQuestions}</h2>
            <p className="text-sm text-muted-foreground">{t.noQuestionsMsg}</p>
          </div>
        ) : (
          <>
            {/* Sticky progress */}
            <div className="sticky top-0 z-10 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 mb-4 bg-[color:var(--background)]/85 backdrop-blur-md border-b border-border/60">
              <div className="flex items-center gap-3 text-xs">
                <div className="text-muted-foreground font-medium tabular-nums shrink-0">{answeredQ}/{totalQ}</div>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${progress}%`, background: "linear-gradient(90deg, color-mix(in oklab, var(--primary) 85%, white), var(--primary))" }}
                  />
                </div>
                <div className="text-foreground font-semibold tabular-nums shrink-0">{progress}%</div>
              </div>
            </div>

            {/* Name card */}
            <div className="rounded-2xl bg-card ring-1 ring-black/5 shadow-sm p-5 sm:p-6 mb-3">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-serif text-lg font-semibold text-foreground">{t.nameCard}</h3>
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive ring-1 ring-destructive/20">{nt.badge}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{nt.desc}</p>
              <Input
                placeholder={nt.ph}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="h-12 text-base rounded-xl"
              />
              <label className={`mt-3 flex items-start gap-3 text-sm cursor-pointer rounded-xl p-3 ring-1 transition-colors ${publicName ? "bg-primary/10 ring-primary/30" : "bg-muted/30 ring-border hover:bg-muted/50"}`}>
                <Checkbox checked={publicName} onCheckedChange={(c) => setPublicName(!!c)} className="mt-0.5" />
                <span className="text-foreground/90 leading-snug">{nt.toggle}</span>
              </label>
              {!publicName && <p className="mt-2 text-xs text-muted-foreground">{nt.anon}</p>}
            </div>

            {/* Questions */}
            <div className="space-y-3">
              {displayQuestions.map((q, i) => {
                const isText = q.kind === "text";
                const v = answers[q.id];
                const isAnswered = q.kind === "multi" ? (Array.isArray(v) && v.length > 0) : q.kind === "rating" ? (v && v >= 1) : (v !== undefined && v !== null && v !== "");
                return (
                  <div key={q.id} className={`rounded-2xl bg-card ring-1 shadow-sm transition-shadow p-5 sm:p-6 ${isAnswered ? "ring-primary/25 shadow-[0_10px_25px_-15px_color-mix(in_oklab,var(--primary)_60%,transparent)]" : "ring-black/5"}`}>
                    <div className="flex items-start gap-3 mb-4">
                      <div className={`shrink-0 grid place-items-center h-8 w-8 rounded-full text-xs font-bold tabular-nums transition-colors ${isAnswered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {isAnswered ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-serif text-lg leading-snug font-semibold text-foreground">
                          {q.label}
                          {q.required && <span className="text-destructive font-normal"> *</span>}
                        </h3>
                        {!q.required && (
                          <span className="mt-1 inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{t.optional}</span>
                        )}
                        {isText && !q.required && <p className="mt-1.5 text-xs text-muted-foreground">{t.textCommentDesc}</p>}
                      </div>
                    </div>
                    <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} t={t} />
                  </div>
                );
              })}
            </div>

            {/* Privacy */}
            <div className="mt-4 rounded-2xl p-5 sm:p-6 ring-1 ring-primary/25 bg-linear-to-br from-primary/[0.04] to-primary/[0.08]">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-serif text-lg font-semibold text-foreground">{t.privacyTitle}</h3>
                {sv.privacy_required && <span className="text-destructive text-sm">*</span>}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap mb-4">
                {sv.privacy_text?.trim() ? sv.privacy_text : t.privacyDesc}
              </p>
              <label className={`flex items-start gap-3 text-sm cursor-pointer rounded-xl p-3 ring-1 transition-colors ${privacy ? "bg-primary/10 ring-primary/30" : "bg-card ring-border hover:bg-muted/40"}`}>
                <Checkbox checked={privacy} onCheckedChange={(c) => setPrivacy(!!c)} className="mt-0.5" />
                <span className="text-foreground/90">{t.privacyLabel}</span>
              </label>
            </div>

            {/* Submit */}
            <div className="mt-6">
              <Button
                size="lg"
                className="w-full h-14 text-base font-semibold shadow-[0_15px_35px_-10px_color-mix(in_oklab,var(--primary)_60%,transparent)] hover:shadow-[0_18px_40px_-8px_color-mix(in_oklab,var(--primary)_70%,transparent)] transition-shadow rounded-xl"
                disabled={submitting || !canSubmit}
                onClick={submit}
              >
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t.submitting}</> : <><CheckCircle2 className="h-5 w-5 mr-2" />{t.submit}</>}
              </Button>
              <p className="text-center text-xs text-muted-foreground mt-3">{t.footerNote}</p>
              {sv.public_results && (
                <div className="text-center mt-3">
                  <Link to="/feedback/$slug" params={{ slug: sv.slug }} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    <BarChart3 className="h-3.5 w-3.5" />{t.viewResults}
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function QuestionInput({ q, value, onChange, t }: { q: Question; value: any; onChange: (v: any) => void; t: typeof T["it"] }) {
  if (q.kind === "rating") {
    const v = value ?? 0;
    const labels = ["Molto scarso", "Scarso", "Sufficiente", "Buono", "Ottimo"];
    return (
      <div>
        <div className="flex gap-1 justify-between sm:justify-start sm:gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={t.starAria(n)}
              className={`group relative grid place-items-center h-12 w-12 sm:h-14 sm:w-14 rounded-2xl transition-all active:scale-90 ${n <= v ? "bg-linear-to-br from-amber-100 to-amber-50 ring-1 ring-amber-300/60 shadow-sm" : "bg-muted/40 hover:bg-muted ring-1 ring-border"}`}
            >
              <Star className={`h-6 w-6 sm:h-7 sm:w-7 transition-transform group-hover:scale-110 ${n <= v ? "fill-amber-400 text-amber-400 drop-shadow-[0_1px_2px_rgba(245,158,11,0.35)]" : "text-muted-foreground/40"}`} />
            </button>
          ))}
        </div>
        {v >= 1 && (
          <div className="mt-3 text-xs font-medium text-primary/80 flex items-center gap-1.5">
            <span className="tabular-nums font-bold text-foreground">{v}/5</span>
            <span className="text-muted-foreground">·</span>
            <span>{labels[v - 1]}</span>
          </div>
        )}
      </div>
    );
  }

  if (q.kind === "yesno") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {[["yes", t.yes], ["no", t.no]].map(([k, l]) => {
          const active = value === k;
          const isYes = k === "yes";
          return (
            <button
              key={k}
              type="button"
              onClick={() => onChange(k)}
              className={`h-14 rounded-xl text-base font-semibold transition-all active:scale-[0.98] ring-1 ${
                active
                  ? isYes
                    ? "bg-emerald-500 text-white ring-emerald-500 shadow-[0_10px_25px_-10px_rgba(16,185,129,0.6)]"
                    : "bg-destructive text-destructive-foreground ring-destructive shadow-[0_10px_25px_-10px_color-mix(in_oklab,var(--destructive)_60%,transparent)]"
                  : "bg-card text-foreground ring-border hover:bg-muted/60"
              }`}
            >
              {l}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.kind === "single") {
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className={`w-full text-left px-4 py-3.5 rounded-xl text-sm font-medium transition-all ring-1 flex items-center gap-3 ${
                active
                  ? "bg-primary/10 ring-primary text-foreground shadow-[0_6px_20px_-12px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                  : "bg-card ring-border hover:bg-muted/50"
              }`}
            >
              <span className={`h-4 w-4 rounded-full grid place-items-center ring-1 shrink-0 ${active ? "ring-primary bg-primary" : "ring-border"}`}>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
              </span>
              <span className="flex-1 min-w-0">{o}</span>
            </button>
          );
        })}
      </div>
    );
  }
  if (q.kind === "multi") {
    const list: string[] = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((o) => {
          const checked = list.includes(o);
          return (
            <label
              key={o}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium cursor-pointer transition-all ring-1 ${
                checked ? "bg-primary/10 ring-primary" : "bg-card ring-border hover:bg-muted/50"
              }`}
            >
              <Checkbox checked={checked} onCheckedChange={(c) => onChange(c ? [...list, o] : list.filter((x) => x !== o))} />
              <span>{o}</span>
            </label>
          );
        })}
      </div>
    );
  }
  return <Textarea rows={4} value={value ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={2000} placeholder={t.textPlaceholder} className="rounded-xl text-base resize-none" />;
}
