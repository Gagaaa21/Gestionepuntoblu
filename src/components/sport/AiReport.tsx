import type { ReactElement } from "react";

/** Renderizza in modo ordinato le risposte dell'assistente AI (markdown leggero). */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  });
}

export function AiReport({ text, title, compact }: { text: string; title?: string; compact?: boolean }) {
  const lines = text.split("\n").map((l) => l.trimEnd());
  const blocks: ReactElement[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`u${blocks.length}`} className={compact ? "space-y-1" : "space-y-1.5"}>
        {bullets.map((b, i) => (
          <li key={i} className={compact ? "flex gap-2 leading-snug" : "flex gap-2 leading-relaxed"}>
            <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-primary/70" />
            <span>{inline(b)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { flush(); continue; }
    const bullet = l.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) { bullets.push(bullet[1]); continue; }
    flush();
    const heading = l.match(/^#{1,6}\s+(.*)$/);
    if (heading || (/^\*\*[^*]+\*\*:?$/.test(l))) {
      blocks.push(
        <h4 key={`h${blocks.length}`} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {(heading ? heading[1] : l.replace(/\*\*/g, "").replace(/:$/, ""))}
        </h4>,
      );
      continue;
    }
    blocks.push(<p key={`p${blocks.length}`} className={compact ? "leading-snug" : "leading-relaxed"}>{inline(l)}</p>);
  }
  flush();

  return (
    <div className={compact
      ? "rounded-lg border bg-background p-3 text-[13px] space-y-2"
      : "rounded-xl border bg-background p-4 text-sm space-y-3"}>
      {title && <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">{title}</div>}
      {blocks}
    </div>
  );
}

