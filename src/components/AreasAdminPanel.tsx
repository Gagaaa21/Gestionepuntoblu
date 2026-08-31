import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Layers, Plus, Pencil, Trash2, Users } from "lucide-react";
import { AREA_TABS, AREA_COLORS, areaColor } from "@/lib/area-catalog";
import {
  adminListAreas, adminSaveArea, adminDeleteArea, adminSetContactVisibility,
} from "@/lib/api/areas.functions";
import { formatOperator } from "@/lib/format-operator";

type AreaWithMembers = {
  id: string; name: string; description: string | null; color: string; icon: string;
  tabs: string[]; sort_order: number; members: string[];
};

type UserLite = { id: string; username: string; isAdmin?: boolean; show_in_contacts?: boolean };

const emptyDraft = () => ({
  id: null as string | null,
  name: "",
  description: "",
  color: "navy",
  tabs: [] as string[],
  sort_order: 0,
  members: [] as string[],
});

export function AreasAdminPanel({ users, onUsersChanged }: { users: UserLite[]; onUsersChanged?: () => void }) {
  const listAreas = useServerFn(adminListAreas);
  const saveArea = useServerFn(adminSaveArea);
  const deleteArea = useServerFn(adminDeleteArea);
  const setContactVisibility = useServerFn(adminSetContactVisibility);

  const [areas, setAreas] = useState<AreaWithMembers[]>([]);
  const [draft, setDraft] = useState(emptyDraft());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setAreas((await listAreas()) as AreaWithMembers[]); }
    catch (e: any) { toast.error(e?.message ?? "Errore caricamento aree"); }
  };
  useEffect(() => { load(); }, []);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.username.localeCompare(b.username, "it", { sensitivity: "base" })),
    [users],
  );
  const adminUsers = useMemo(() => sortedUsers.filter((u) => u.isAdmin), [sortedUsers]);

  const openNew = () => { setDraft({ ...emptyDraft(), sort_order: areas.length }); setOpen(true); };
  const openEdit = (a: AreaWithMembers) => {
    setDraft({
      id: a.id, name: a.name, description: a.description ?? "", color: a.color,
      tabs: [...a.tabs], sort_order: a.sort_order, members: [...a.members],
    });
    setOpen(true);
  };

  const toggle = (key: "tabs" | "members", value: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((x) => x !== value) : [...d[key], value],
    }));

  const submit = async () => {
    if (!draft.name.trim()) return toast.error("Indica il nome dell'area");
    setBusy(true);
    try {
      await saveArea({ data: { ...draft, description: draft.description || null } });
      toast.success("Area salvata");
      setOpen(false);
      load();
    } catch (e: any) { toast.error(e?.message ?? "Errore"); }
    finally { setBusy(false); }
  };

  const remove = async (a: AreaWithMembers) => {
    if (!confirm(`Eliminare l'area "${a.name}"? Gli utenti perderanno l'accesso alle sue schede.`)) return;
    try { await deleteArea({ data: { id: a.id } }); toast.success("Area eliminata"); load(); }
    catch (e: any) { toast.error(e?.message ?? "Errore"); }
  };

  const toggleContact = async (u: UserLite, show: boolean) => {
    try {
      await setContactVisibility({ data: { userId: u.id, show } });
      toast.success(show ? "Admin visibile nei contatti" : "Admin nascosto dai contatti");
      onUsersChanged?.();
    } catch (e: any) { toast.error(e?.message ?? "Errore"); }
  };

  return (
    <>
      <Card className="editorial-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="font-display text-xl tracking-tight">Macro aree</CardTitle>
              <CardDescription>Raggruppa le schede del sito e scegli chi può accedervi.</CardDescription>
            </div>
          </div>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nuova area</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {areas.length === 0 && (
            <p className="text-sm text-muted-foreground">Nessuna area creata. Crea ad esempio “Punto Blu” con le schede cliniche.</p>
          )}
          {areas.map((a) => {
            const c = areaColor(a.color);
            return (
              <div key={a.id} className={`rounded-xl border p-4 ring-1 ${c.ring}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                      <h3 className="font-display text-lg leading-tight">{a.name}</h3>
                    </div>
                    {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">{a.tabs.length}</span> schede ·{" "}
                      <span className="font-medium text-foreground/80">{a.members.length}</span> utenti abilitati
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {a.tabs.map((p) => (
                        <span key={p} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          {AREA_TABS.find((t) => t.path === p)?.label ?? p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5 mr-1" /> Modifica</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="editorial-card">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-admin/10 text-admin ring-1 ring-admin/20">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="font-display text-xl tracking-tight">Amministratori di riferimento</CardTitle>
              <CardDescription>Scegli quali admin compaiono nella lista contatti mostrata agli operatori.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {adminUsers.length === 0 && <p className="text-sm text-muted-foreground">Nessun amministratore.</p>}
          {adminUsers.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="text-sm font-medium">{formatOperator(u.username)}</span>
              <Switch
                checked={u.show_in_contacts !== false}
                onCheckedChange={(v) => toggleContact(u, v)}
                aria-label={`Mostra ${u.username} nei contatti`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Modifica area" : "Nuova macro area"}</DialogTitle>
            <DialogDescription>Definisci nome, schede incluse e utenti abilitati.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome area</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Es. Punto Blu" />
              </div>
              <div className="space-y-1.5">
                <Label>Ordine</Label>
                <Input type="number" value={draft.sort_order}
                  onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descrizione</Label>
              <Textarea rows={2} value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Breve descrizione dell'area" />
            </div>

            <div className="space-y-1.5">
              <Label>Colore</Label>
              <div className="flex flex-wrap gap-2">
                {AREA_COLORS.map((c) => (
                  <button key={c.value} type="button" onClick={() => setDraft({ ...draft, color: c.value })}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${draft.color === c.value ? "ring-2 ring-primary" : ""}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />{c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Schede incluse</Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {AREA_TABS.map((t) => (
                  <label key={t.path} className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer">
                    <Checkbox checked={draft.tabs.includes(t.path)} onCheckedChange={() => toggle("tabs", t.path)} />
                    <span className="min-w-0">
                      <span className="font-medium">{t.label}</span>
                      <span className="block text-xs text-muted-foreground">{t.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Utenti abilitati</Label>
              <div className="grid gap-1.5 sm:grid-cols-2 max-h-64 overflow-y-auto pr-1">
                {sortedUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer">
                    <Checkbox checked={draft.members.includes(u.id)} onCheckedChange={() => toggle("members", u.id)} />
                    <span className="truncate">{formatOperator(u.username)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Salvataggio…" : "Salva area"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
