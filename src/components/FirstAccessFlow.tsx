import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { renderGuide } from "@/lib/render-guide";
import { AdminContacts } from "@/components/AdminContacts";
import { BookOpen } from "lucide-react";

type Props = { userId: string };

export function FirstAccessFlow({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles" as any)
        .select("guide_seen")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled || !prof || (prof as any).guide_seen) return;
      const { data: g } = await supabase.from("app_settings" as any).select("value").eq("key", "user_guide").maybeSingle();
      if (cancelled) return;
      setGuide((g as any)?.value?.trim() ? (g as any).value : `# Benvenuto!\n\nQuesta è la tua prima volta. Un breve riassunto:\n\n- **Registra un intervento** dalla dashboard.\n- Con nome e cognome completi il sistema crea la cartella clinica.\n- Il tasto **Tema** ti permette di personalizzare colori, angoli, densità e carattere.\n- La campanella ti mostra le comunicazioni degli admin.\n\nPuoi rileggere la guida in qualsiasi momento dal menu **Guida**.`);
      setOpen(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const finishGuide = async () => {
    await supabase.from("profiles" as any).update({ guide_seen: true }).eq("id", userId);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Benvenuto!</DialogTitle>
          <DialogDescription>Leggi questa breve guida prima di iniziare. Potrai sempre rivederla dal menu.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="prose prose-sm max-w-none">{renderGuide(guide)}</div>
          <AdminContacts />
        </ScrollArea>
        <DialogFooter>
          <Button onClick={finishGuide}>Ho capito</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
