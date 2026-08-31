import type { ReactNode } from "react";
import { BackButton } from "@/components/BackHome";
import { cn } from "@/lib/utils";

/**
 * Header unico di tutte le pagine interne: stessa altezza, stessa gerarchia,
 * stesso ritorno contestuale. Le azioni specifiche della pagina vanno in `actions`.
 */
export function PageHeader({
  icon,
  title,
  subtitle,
  eyebrow,
  actions,
  tone = "default",
  back = true,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  tone?: "default" | "admin";
  back?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="page-header sticky top-0 z-30">
      <div className="container mx-auto space-y-3 px-4 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {back && <BackButton />}
            {icon && (
              <span
                className={cn(
                  "hidden h-10 w-10 shrink-0 place-items-center rounded-2xl ring-1 sm:grid",
                  tone === "admin"
                    ? "bg-admin/10 text-admin ring-admin/25"
                    : "bg-primary/10 text-primary ring-primary/20",
                )}
              >
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {eyebrow && <p className="eyebrow truncate">{eyebrow}</p>}
              <h1 className="truncate font-display text-base leading-tight tracking-tight sm:text-lg">{title}</h1>
              {subtitle && (
                <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </header>
  );
}
