import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOperatorHistory, type OperatorHistory } from "@/lib/api/operator.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Activity, Calendar, MapPin, Hospital, UserCircle, Phone, Briefcase } from "lucide-react";
import { format } from "date-fns";
import { formatOperator } from "@/lib/format-operator";
import { JobIcon } from "@/lib/job-titles";

export const Route = createFileRoute("/operatori/$username")({
  head: ({ params }) => {
    const title = `Storico ${formatOperator(params.username)} · Gestione S.O.G.IT.`;
    const description = `Storico delle attività e degli interventi registrati dall'operatore ${formatOperator(params.username)}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: OperatorHistoryPage,
});

function OperatorHistoryPage() {
  const { username } = useParams({ from: "/operatori/$username" });
  const navigate = useNavigate();
  const fetchHistory = useServerFn(getOperatorHistory);
  const [data, setData] = useState<OperatorHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session?.user) {
          navigate({ to: "/auth", replace: true });
          return;
        }
        const result = await fetchHistory({ data: { username } });
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? "Errore caricamento storico");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  if (loading) {
    return (
      <div className="min-h-screen app-surface grid place-items-center">
        <div className="text-sm text-muted-foreground">Caricamento storico…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen app-surface">
        <main className="container mx-auto px-4 py-8">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" /> Dashboard</Link>
          </Button>
          <Card className="section-card border-destructive/50">
            <CardHeader className="section-header">
              <CardTitle className="font-display text-xl tracking-tight">Errore</CardTitle>
              <CardDescription>{error || "Operatore non trovato"}</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  const displayName = formatOperator(data.profile?.username ?? username);

  return (
    <div className="min-h-screen app-surface">
      <PageHeader
        icon={<UserCircle className="h-5 w-5" />}
        eyebrow="Operatore"
        title={<span className="inline-flex items-center gap-2">{displayName}<JobIcon username={data.profile?.username ?? username} size={16} /></span>}
        subtitle="Storico interventi e statistiche."
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="section-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="icon-chip"><Activity className="h-5 w-5" /></div>
              <div>
                <p className="text-2xl font-display font-semibold">{data.stats.total}</p>
                <p className="text-xs text-muted-foreground">Interventi totali</p>
              </div>
            </CardContent>
          </Card>
          <Card className="section-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="icon-chip"><Calendar className="h-5 w-5" /></div>
              <div>
                <p className="text-2xl font-display font-semibold">{data.stats.thisMonth}</p>
                <p className="text-xs text-muted-foreground">Questo mese</p>
              </div>
            </CardContent>
          </Card>
          <Card className="section-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="icon-chip"><Hospital className="h-5 w-5" /></div>
              <div>
                <p className="text-2xl font-display font-semibold">{data.stats.ppiCount}</p>
                <p className="text-xs text-muted-foreground">Invii in PPI</p>
              </div>
            </CardContent>
          </Card>
          <Card className="section-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="icon-chip"><MapPin className="h-5 w-5" /></div>
              <div>
                <p className="text-2xl font-display font-semibold">{data.stats.fuoriSedeCount}</p>
                <p className="text-xs text-muted-foreground">Fuori sede</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Profile details */}
        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><Briefcase className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Dettagli operatore</CardTitle>
                <CardDescription className="leading-relaxed">Ruolo e contatto.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm"><span className="text-muted-foreground">Username:</span> {data.profile?.username}</p>
            <p className="text-sm flex items-center gap-2">
              <span className="text-muted-foreground">Ruolo:</span>
              <JobIcon username={data.profile?.username ?? username} size={14} />
              <span>{data.profile?.job_title ? data.profile.job_title.charAt(0).toUpperCase() + data.profile.job_title.slice(1) : "Non specificato"}</span>
            </p>
            {data.profile?.phone && (
              <p className="text-sm flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{data.profile.phone}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Interventions by type */}
        {data.stats.byType.length > 0 && (
          <Card className="section-card">
            <CardHeader className="section-header">
              <div className="flex items-start gap-3">
                <div className="icon-chip"><Briefcase className="h-5 w-5" /></div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="font-display text-xl tracking-tight">Tipologie di intervento</CardTitle>
                  <CardDescription className="leading-relaxed">Distribuzione per tipo di evento.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.stats.byType.map((t) => (
                  <Badge key={t.type} variant="secondary" className="text-sm">
                    {t.type} <span className="ml-1 font-semibold">{t.count}</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}



        {/* Interventions list */}
        <Card className="section-card">
          <CardHeader className="section-header">
            <div className="flex items-start gap-3">
              <div className="icon-chip"><Activity className="h-5 w-5" /></div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="font-display text-xl tracking-tight">Elenco interventi</CardTitle>
                <CardDescription className="leading-relaxed">Tutti gli interventi registrati per questo operatore.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Paziente</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>PPI</TableHead>
                    <TableHead>Fuori</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.interventions.map((i) => {
                    const patientName = i.patient_id
                      ? `${i.patient_last_name ?? ""} ${i.patient_first_name ?? ""}`.trim() || "—"
                      : i.display_name
                        ? <span className="italic">{i.display_name}</span>
                        : <span className="italic text-muted-foreground">Paziente Sconosciuto</span>;
                    return (
                      <TableRow key={i.id}>
                        <TableCell className="text-xs whitespace-nowrap">{format(new Date(i.intervention_date), "dd/MM/yyyy HH:mm")}</TableCell>
                        <TableCell className="text-sm">{patientName}</TableCell>
                        <TableCell className="text-sm">{i.intervention_type}</TableCell>
                        <TableCell>{i.invio_in_ppi ? "Sì" : "No"}</TableCell>
                        <TableCell>{i.fuori_sede ? "Sì" : "No"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{i.notes || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {data.interventions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nessun intervento registrato per questo operatore.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
