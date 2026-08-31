import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, Lock, Database, UserCheck, FileText, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Sicurezza & Privacy · Archivio clinico Punto Blu" },
      { name: "description", content: "Pratiche di sicurezza e privacy dell'archivio clinico Punto Blu." },
      { property: "og:url", content: "https://gestionepuntoblu.lovable.app/privacy" },
      { property: "og:title", content: "Sicurezza & Privacy · Archivio clinico Punto Blu" },
      { property: "og:description", content: "Pratiche di sicurezza e privacy dell'archivio clinico Punto Blu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Sicurezza & Privacy · Archivio clinico Punto Blu" },
      { name: "twitter:description", content: "Pratiche di sicurezza e privacy dell'archivio clinico Punto Blu." },
    ],
    links: [{ rel: "canonical", href: "https://gestionepuntoblu.lovable.app/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-linear-to-b from-background to-muted/40">
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        eyebrow="Informativa"
        title="Sicurezza & Privacy"
        subtitle="Pratiche operative dell'applicazione."
      />

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-3xl">
        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><FileText className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Informazioni su questa pagina</CardTitle>
                <CardDescription className="leading-relaxed">
                  Questa pagina è mantenuta dal titolare dell'archivio clinico Punto Blu per rispondere
                  alle domande comuni su sicurezza e privacy del servizio. Non costituisce una certificazione
                  indipendente né una verifica esterna.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><UserCheck className="h-5 w-5" /></div>
              <CardTitle>Accesso e autenticazione</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed">
            <p>L'accesso al sistema richiede autenticazione personale con nome utente e password.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Le password sono memorizzate in forma cifrata dal provider di autenticazione.</li>
              <li>Al primo accesso è obbligatorio cambiare la password temporanea fornita dall'amministratore.</li>
              <li>Dopo 5 tentativi falliti consecutivi l'account viene bloccato temporaneamente per 15 minuti; l'admin può sbloccarlo manualmente.</li>
              <li>Ogni utente ha un ruolo (utente, ufficio, admin) che determina le funzioni accessibili. I controlli di ruolo sono applicati lato server e a livello di database.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><Database className="h-5 w-5" /></div>
              <CardTitle>Protezione dei dati</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed">
            <ul className="list-disc pl-5 space-y-1">
              <li>I dati dei pazienti, gli interventi e le segnalazioni sono accessibili solo agli utenti autenticati con ruolo idoneo.</li>
              <li>I numeri di telefono degli utenti sono dati sensibili: vengono letti solo tramite funzioni server lato amministratore e non sono esposti agli altri utenti.</li>
              <li>Le operazioni di creazione, modifica ed eliminazione su pazienti, interventi, profili, ruoli e segnalazioni sono tracciate in un registro attività accessibile all'amministratore programmatore.</li>
              <li>L'infrastruttura di hosting e database è fornita da Lovable Cloud (Supabase). Comunicazioni client-server in HTTPS.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><Lock className="h-5 w-5" /></div>
              <CardTitle>Conservazione e cancellazione</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed">
            <p>
              I dati clinici sono conservati per il tempo necessario alle finalità di gestione operativa
              concordate con il titolare. La cancellazione di pazienti, interventi e utenti è effettuata
              dall'amministratore tramite le funzioni dedicate all'interno dell'applicazione.
            </p>
          </CardContent>
        </Card>

        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><AlertCircle className="h-5 w-5" /></div>
              <CardTitle>Segnalazione problemi di sicurezza</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed">
            <p>
              Per segnalare un problema di sicurezza o richiedere informazioni sul trattamento dei tuoi dati,
              contatta direttamente l'amministratore programmatore tramite i recapiti elencati nella sezione
              "Contatti admin" dell'applicazione.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
