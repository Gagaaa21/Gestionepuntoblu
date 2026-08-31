import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { completeFirstAccess, preLoginCheck, recordLoginResult } from "@/lib/api/admin.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import logoSogit from "@/assets/logo-sogit.jpg.asset.json";
import { retryOnNetworkError } from "@/lib/network-retry";
import { isNetworkError } from "@/lib/offline-queue";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Accesso · Gestione S.O.G.IT." },
      { name: "description", content: "Accedi all'area riservata di Gestione S.O.G.IT. per comunicazioni, trasporti, servizi sportivi e questionari." },
      { property: "og:url", content: "https://your-domain.example/auth" },
      { property: "og:title", content: "Accesso · Gestione S.O.G.IT." },
      { property: "og:description", content: "Accedi all'area riservata di Gestione S.O.G.IT. per comunicazioni, trasporti, servizi sportivi e questionari." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Accesso · Gestione S.O.G.IT." },
      { name: "twitter:description", content: "Accedi all'area riservata di Gestione S.O.G.IT. per comunicazioni, trasporti, servizi sportivi e questionari." },
    ],
    links: [{ rel: "canonical", href: "https://your-domain.example/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const preCheck = useServerFn(preLoginCheck);
  const recordResult = useServerFn(recordLoginResult);
  const complete = useServerFn(completeFirstAccess);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<"login" | "change">("login");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/gestione", replace: true });
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setRetryInfo(null);
    const uname = username.trim();
    const pwd = password;
    const onAttempt = (attempt: number, total: number) => {
      if (attempt > 1) setRetryInfo(`Connessione lenta, riprovo (tentativo ${attempt} di ${total})…`);
    };
    try {
      let pre: { email: string | null; lockedUntil: string | null; suspended: { until: string | null; reason: string | null } | null; degraded?: boolean };
      try {
        pre = await retryOnNetworkError(() => preCheck({ data: { username: uname } }), { attempts: 2, baseDelayMs: 500, onAttempt }) as typeof pre;
      } catch {
        // Disponibilità prima di tutto: il pre-controllo protegge da blocchi e
        // sospensioni, ma un suo guasto non deve rendere inutilizzabile Auth.
        const safe = uname.toLowerCase().replace(/[^a-z0-9._-]/g, "");
        pre = { email: safe ? `${safe}@archivio.local` : null, lockedUntil: null, suspended: null, degraded: true };
      }
      if (pre.lockedUntil) {
        const mins = Math.max(1, Math.ceil((new Date(pre.lockedUntil).getTime() - Date.now()) / 60000));
        throw new Error(`Account temporaneamente bloccato per troppi tentativi falliti. Riprova tra ${mins} minuti o contatta un amministratore.`);
      }
      if (pre.suspended) {
        const until = pre.suspended.until
          ? `fino al ${new Date(pre.suspended.until).toLocaleString("it-IT")}`
          : "a tempo indeterminato";
        const reason = pre.suspended.reason ? ` Motivo: ${pre.suspended.reason}.` : "";
        throw new Error(`Account sospeso ${until}.${reason} Contatta un amministratore.`);
      }
      if (!pre.email) {
        await recordResult({ data: { username: uname, success: false } }).catch(() => {});
        throw new Error("Nome utente o password errati");
      }
      if (pre.degraded) setRetryInfo("Accesso essenziale attivo: alcuni controlli avanzati sono temporaneamente indisponibili…");
      const signInRes = await retryOnNetworkError(async () => {
        const res = await supabase.auth.signInWithPassword({ email: pre.email!, password: pwd });
        if (res.error && isNetworkError(res.error)) throw res.error;
        return res;
      }, { onAttempt });
      if (signInRes.error) {
        const r = await recordResult({ data: { username: uname, success: false } }).catch(() => null) as any;
        if (r?.lockedUntil) throw new Error("Troppi tentativi falliti: account bloccato per 15 minuti.");
        throw new Error("Nome utente o password errati");
      }
      await recordResult({ data: { username: uname, success: true } }).catch(() => {});
      const { data: userRes } = await retryOnNetworkError(() => supabase.auth.getUser(), { onAttempt });
      const { data: profile } = await supabase
        .from("profiles" as any).select("must_change_password").eq("id", userRes.user!.id).maybeSingle();
      if ((profile as any)?.must_change_password) setStage("change");
      else navigate({ to: "/gestione", replace: true });
    } catch (err: any) {
      if (isNetworkError(err)) setError("Impossibile contattare il server. Controlla la connessione e riprova.");
      else setError(err.message ?? "Accesso fallito");
    } finally { setLoading(false); setRetryInfo(null); }
  };


  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { setError("La password deve avere almeno 6 caratteri"); return; }
    if (newPassword !== confirmPassword) { setError("Le password non coincidono"); return; }
    setLoading(true); setError(null);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password: newPassword });
      if (upErr) throw upErr;
      await complete({ data: { phone: phone.trim() } });
      navigate({ to: "/gestione", replace: true });
    } catch (err: any) {
      setError(err.message ?? "Errore");
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-stage relative min-h-screen overflow-hidden">
      {/* Logo S.O.G.IT. sfocato sullo sfondo */}
      <img
        src={logoSogit.url}
        alt=""
        aria-hidden
        className="auth-stage-logo"
      />

      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[26rem]">

          <div className="auth-card p-6 sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div className="brand-chip h-16 w-16">
                <img src={logoSogit.url} alt="Logo S.O.G.IT." className="h-full w-full object-contain" />
              </div>
              <p className="eyebrow mt-5">S.O.G.IT. · Lignano Sabbiadoro</p>
              <p className="mt-1 text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">
                {stage === "login" ? "Area riservata" : "Primo accesso"}
              </p>

              <h1 className="mt-2.5 font-display text-[1.6rem] leading-tight tracking-tight sm:text-3xl">
                {stage === "login" ? "Bentornato" : "Imposta una nuova password"}
              </h1>
              <p className="mt-2 max-w-[22rem] text-sm leading-relaxed text-muted-foreground">
                {stage === "login"
                  ? "Inserisci le tue credenziali per continuare."
                  : "Scegli una password personale per proteggere il tuo account."}
              </p>
            </div>

            <div className="my-6 h-px bg-border/70" />

            {error && (
              <Alert variant="destructive" className="mb-5">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {retryInfo && (
              <Alert className="mb-5 border-primary/30 bg-primary/5 text-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>{retryInfo}</AlertDescription>
              </Alert>
            )}

            {stage === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="u">Nome utente</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="u" data-no-capitalize="true" className="h-11 pl-9" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" disabled={loading} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="p" className="h-11 pl-9 pr-10" type={showPwd ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" disabled={loading} />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      aria-label={showPwd ? "Nascondi password" : "Mostra password"}
                      className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading}>
                  {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Accesso…</>) : "Accedi"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="np">Nuova password</Label>
                  <Input id="np" className="h-11" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cp">Conferma nuova password</Label>
                  <Input id="cp" className="h-11" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ph">Numero di cellulare <span className="font-normal text-muted-foreground">(facoltativo)</span></Label>
                  <Input id="ph" className="h-11" inputMode="tel" placeholder="es. +39 333 1234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Potrai modificarlo in qualsiasi momento dal tuo profilo.</p>
                </div>
                <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading}>{loading ? "Aggiornamento…" : "Imposta password"}</Button>
              </form>
            )}
          </div>

          <div className="mt-6 space-y-2 text-center">
            <p className="rule-center">Assistenza</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Credenziali dimenticate? Contatta un amministratore del gruppo.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}


