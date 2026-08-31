import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, ExternalLink } from "lucide-react";
import logoSogit from "@/assets/logo-sogit.jpg.asset.json";

export const Route = createFileRoute("/qr")({
  head: () => ({
    meta: [
      { title: "QR questionari · Gestione S.O.G.IT." },
      { name: "description", content: "Mostra o scarica il codice QR universale dei questionari di gradimento S.O.G.IT. Lignano." },
      { property: "og:url", content: "https://your-domain.example/qr" },
      { property: "og:title", content: "QR questionari · Gestione S.O.G.IT." },
      { property: "og:description", content: "Mostra o scarica il codice QR universale dei questionari di gradimento S.O.G.IT. Lignano." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "QR questionari · Gestione S.O.G.IT." },
      { name: "twitter:description", content: "Mostra o scarica il codice QR universale dei questionari di gradimento S.O.G.IT. Lignano." },
    ],
    links: [{ rel: "canonical", href: "https://your-domain.example/qr" }],
  }),
  component: QrPage,
});

function QrPage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth", replace: true });
    });
  }, []);

  // Impostato dopo l'idratazione: evita differenze fra HTML del server e del browser.
  const [landingUrl, setLandingUrl] = useState("");
  useEffect(() => { setLandingUrl(`${window.location.origin}/feedback`); }, []);

  useEffect(() => {
    if (!landingUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, landingUrl, { width: 320, margin: 2, color: { dark: "#0f1b3d", light: "#ffffff" } });
    QRCode.toDataURL(landingUrl, { width: 1024, margin: 2, color: { dark: "#0f1b3d", light: "#ffffff" } }).then(setDataUrl);
  }, [landingUrl]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "qr-sogit-feedback.png";
    a.click();
  };

  return (
    <div className="relative min-h-screen app-surface overflow-hidden">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center">
        <img src={logoSogit.url} alt="" className="w-[min(90vw,720px)] opacity-[0.06] blur-[1px] select-none" />
        <div className="absolute inset-0 bg-linear-to-b from-background/60 via-background/30 to-background/80" />
      </div>

      <div className="relative z-10">
        <header className="page-header">
          <div className="container mx-auto px-4 py-4">
            <Link to="/gestione" className="nav-tile">
              <span className="nav-tile-icon"><ArrowLeft className="h-4 w-4" /></span>Gestione SOGIT
            </Link>
          </div>
        </header>

        <main className="container mx-auto max-w-md px-4 py-8 space-y-5">
          <section>
            <p className="eyebrow">Questionari di gradimento</p>
            <h1 className="font-display text-2xl md:text-3xl tracking-tight">Codice QR da mostrare</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Questo QR è lo stesso per tutti i servizi: chi lo inquadra sceglie il questionario da compilare.
            </p>
          </section>

          <div className="editorial-card p-5 flex flex-col items-center gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm"><canvas ref={canvasRef} /></div>
            <Button onClick={download} className="w-full"><Download className="mr-2 h-4 w-4" />Scarica QR (PNG)</Button>
            <div className="w-full space-y-2 border-t pt-3">
              <Label className="text-xs">Indirizzo del QR</Label>
              <Input readOnly value={landingUrl} onFocus={(e) => e.currentTarget.select()} />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { navigator.clipboard.writeText(landingUrl); toast.success("Link copiato"); }}
                >
                  <Copy className="mr-2 h-4 w-4" />Copia link
                </Button>
                <a href={landingUrl || "/feedback"} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="outline" className="w-full"><ExternalLink className="mr-2 h-4 w-4" />Apri</Button>
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
