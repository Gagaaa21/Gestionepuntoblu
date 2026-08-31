import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { toast } from "sonner";

const ASKED_KEY = "notif-permission-asked-v1";

// One-shot prompt asking every user (including already-registered) to enable
// browser notifications the first time they open the app on this device.
export function NotifPermissionPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return; // già concesso o negato
    try {
      if (window.localStorage.getItem(ASKED_KEY)) return;
    } catch { /* noop */ }
    // Piccolo delay per non sovrapporsi ad altri dialog (es. guida).
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, []);

  const markAsked = () => {
    try { window.localStorage.setItem(ASKED_KEY, "1"); } catch { /* noop */ }
    setOpen(false);
  };

  const enable = async () => {
    try {
      const p = await Notification.requestPermission();
      if (p === "granted") toast.success("Notifiche attivate");
      else if (p === "denied") toast("Notifiche bloccate dal browser");
    } catch {
      toast.error("Notifiche non supportate da questo browser");
    } finally {
      markAsked();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) markAsked(); }}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Attiva le notifiche</DialogTitle>
          <DialogDescription>
            Ricevi un avviso del browser quando arrivano nuove comunicazioni, anche quando l'app non è aperta.
            Puoi cambiare idea in qualsiasi momento dalle impostazioni notifiche.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={markAsked}>Non ora</Button>
          <Button onClick={enable}><Bell className="h-4 w-4 mr-2" /> Attiva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
