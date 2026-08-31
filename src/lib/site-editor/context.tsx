import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CustomFieldType = "text" | "number" | "checkbox" | "select" | "textarea";
export type CustomField = {
  id: string;
  key: string;          // saved into extra_data[key]
  label: string;
  type: CustomFieldType;
  options?: string[];   // for select
  required?: boolean;
};

type EditorCtx = {
  isDeveloper: boolean;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  ready: boolean;
  // text/image overrides
  text: (id: string, fallback: string) => string;
  image: (id: string, fallback: string) => string;
  // color overrides (hex)
  colors: Record<string, string>;
  setColor: (token: string, hex: string | null) => Promise<void>;
  setText: (id: string, value: string) => Promise<void>;
  setImage: (id: string, dataUrl: string) => Promise<void>;
  // custom form fields
  fields: (formKey: string) => CustomField[];
  setFields: (formKey: string, fields: CustomField[]) => Promise<void>;
  reload: () => Promise<void>;
};

const Ctx = createContext<EditorCtx | null>(null);

const COLOR_TOKENS = ["primary", "background", "foreground", "accent", "card", "border"] as const;

function applyColors(_colors: Record<string, string>) {
  // Color theme overrides are disabled; ensure no stale overrides remain on :root.
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  COLOR_TOKENS.forEach((t) => root.style.removeProperty(`--${t}`));
}

export function SiteEditorProvider({ children }: { children: ReactNode }) {
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Record<string, any>>({});

  async function loadAll() {
    const { data } = await supabase.from("site_customizations" as any).select("key,value");
    const map: Record<string, any> = {};
    (data ?? []).forEach((r: any) => { map[r.key] = r.value; });
    setRows(map);
    applyColors(map["__colors__"] ?? {});
    setReady(true);
  }

  async function checkRole() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setIsDeveloper(false); return; }
    const { data: roles } = await supabase.from("user_roles" as any).select("role").eq("user_id", u.user.id);
    setIsDeveloper(!!roles?.some((r: any) => r.role === "developer"));
  }

  useEffect(() => {
    loadAll();
    checkRole();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        checkRole();
        if (event === "SIGNED_OUT") setEditMode(false);
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  async function upsert(key: string, value: any) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("site_customizations" as any).upsert({ key, value, updated_by: u.user?.id, updated_at: new Date().toISOString() } as any, { onConflict: "key" });
    if (error) throw error;
    setRows((prev) => ({ ...prev, [key]: value }));
    if (key === "__colors__") applyColors(value);
  }

  const value: EditorCtx = useMemo(() => ({
    isDeveloper,
    editMode: isDeveloper && editMode,
    setEditMode,
    ready,
    text: (id, fb) => (rows[`text:${id}`] as string | undefined) ?? fb,
    image: (id, fb) => (rows[`image:${id}`] as string | undefined) ?? fb,
    colors: (rows["__colors__"] as Record<string, string> | undefined) ?? {},
    setColor: async (token, hex) => {
      const cur = { ...((rows["__colors__"] as any) ?? {}) };
      if (hex) cur[token] = hex; else delete cur[token];
      await upsert("__colors__", cur);
    },
    setText: (id, v) => upsert(`text:${id}`, v),
    setImage: (id, dataUrl) => upsert(`image:${id}`, dataUrl),
    fields: (formKey) => ((rows[`fields:${formKey}`] as CustomField[] | undefined) ?? []),
    setFields: (formKey, f) => upsert(`fields:${formKey}`, f),
    reload: loadAll,
  }), [isDeveloper, editMode, ready, rows]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSiteEditor() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSiteEditor must be used within SiteEditorProvider");
  return v;
}
