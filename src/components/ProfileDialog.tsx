import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOwnPhone, updateOwnPhone } from "@/lib/api/admin.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Props = { userId: string; open: boolean; onOpenChange: (o: boolean) => void };

export function ProfileDialog({ userId, open, onOpenChange }: Props) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const fetchPhone = useServerFn(getOwnPhone);
  const savePhone = useServerFn(updateOwnPhone);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetchPhone();
        setPhone(res?.phone ?? "");
      } catch {
        setPhone("");
      }
    })();
  }, [open, userId]);

  const save = async () => {
    setLoading(true);
    try {
      await savePhone({ data: { phone: phone.trim() } });
      toast.success("Profilo aggiornato");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Il mio profilo</DialogTitle>
          <DialogDescription>Aggiorna il tuo numero di cellulare.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="my-phone">Numero di cellulare</Label>
          <Input id="my-phone" inputMode="tel" placeholder="es. +39 333 1234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={loading}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
