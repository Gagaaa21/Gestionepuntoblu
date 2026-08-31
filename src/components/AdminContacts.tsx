import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAdminContacts } from "@/lib/api/admin.functions";
import { formatOperator } from "@/lib/format-operator";

const PRIMARY_ADMIN = "Gabriele.Simonovich";

type Admin = { username: string; phone: string | null };

export function AdminContacts() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const fetchAdmins = useServerFn(listAdminContacts);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchAdmins();
        const list = (res?.admins ?? []) as Admin[];
        list.sort((a, b) => {
          if (a.username === PRIMARY_ADMIN) return -1;
          if (b.username === PRIMARY_ADMIN) return 1;
          return a.username.localeCompare(b.username, "it", { sensitivity: "base" });
        });
        setAdmins(list);
      } catch {
        setAdmins([]);
      }
    })();
  }, []);

  if (admins.length === 0) return null;

  return (
    <div className="mt-6 rounded-lg border bg-muted/40 p-4">
      <h3 className="text-base font-semibold mb-2">In caso di dubbio contatta un amministratore</h3>
      <ul className="space-y-1">
        {admins.map((a) => (
          <li key={a.username} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">{formatOperator(a.username)}</span>
            {a.phone ? (
              <a href={`tel:${a.phone.replace(/\s+/g, "")}`} className="text-primary hover:underline">{a.phone}</a>
            ) : (
              <span className="text-muted-foreground">numero non disponibile</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
