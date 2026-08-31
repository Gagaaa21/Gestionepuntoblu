import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

type PendingNotif = {
  id: string; title: string; body: string | null; created_at: string;
};

/**
 * Mostra un modale bloccante per ogni comunicazione admin non ancora presa in visione.
 * Non è chiudibile finché l'utente non clicca "Ho preso visione".
 */
export function AnnouncementModal() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<PendingNotif[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async (uid: string) => {
    const { data } = await supabase
      .from("notifications" as any)
      .select("id, title, body, created_at")
      .eq("user_id", uid)
      .eq("requires_ack", true)
      .is("acknowledged_at", null)
      .order("created_at", { ascending: true });
    setItems(((data as any) ?? []) as PendingNotif[]);
  };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) load(uid);
    };
    init();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) load(uid);
      if (!uid) setItems([]);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`ann-${userId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load(userId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const current = items[0];
  if (!current) return null;

  const acknowledge = async () => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await supabase.from("notifications" as any)
        .update({ acknowledged_at: now, read_at: now })
        .eq("id", current.id);
      setItems((prev) => prev.slice(1));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={() => {/* non chiudibile */}}>
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            {current.title}
          </DialogTitle>
          <DialogDescription>
            Comunicazione ricevuta il {format(new Date(current.created_at), "d MMMM yyyy 'alle' HH:mm", { locale: it })}.
          </DialogDescription>
        </DialogHeader>
        {current.body && (
          <div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">
            {current.body}
          </div>
        )}
        {items.length > 1 && (
          <p className="text-xs text-muted-foreground">
            {items.length - 1} altra comunicazione in attesa dopo questa.
          </p>
        )}
        <DialogFooter>
          <Button onClick={acknowledge} disabled={busy} className="w-full sm:w-auto">
            Ho preso visione
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
