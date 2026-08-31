import { Fragment, type ReactNode } from "react";

// Minimal markdown renderer for the user guide
// Supports: # H1, ## H2, ### H3, - bullet, **bold**, blank lines
export function renderGuide(src: string): ReactNode {
  if (!src) return <p className="text-muted-foreground">Nessun contenuto.</p>;
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length === 0) return;
    out.push(
      <ul key={`ul-${out.length}`} className="list-disc pl-6 space-y-1 my-2">
        {list.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
      </ul>
    );
    list = [];
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (/^- /.test(line)) { list.push(line.slice(2)); return; }
    flushList();
    if (/^### /.test(line)) out.push(<h3 key={idx} className="text-base font-semibold mt-4 mb-1">{renderInline(line.slice(4))}</h3>);
    else if (/^## /.test(line)) out.push(<h2 key={idx} className="text-lg font-semibold mt-5 mb-2">{renderInline(line.slice(3))}</h2>);
    else if (/^# /.test(line)) out.push(<h1 key={idx} className="text-2xl font-bold mt-2 mb-3">{renderInline(line.slice(2))}</h1>);
    else if (line.trim() === "") out.push(<div key={idx} className="h-2" />);
    else out.push(<p key={idx} className="my-1 leading-relaxed">{renderInline(line)}</p>);
  });
  flushList();
  return <>{out}</>;
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\*\*(.+)\*\*$/.exec(p);
        if (m) return <strong key={i}>{m[1]}</strong>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
