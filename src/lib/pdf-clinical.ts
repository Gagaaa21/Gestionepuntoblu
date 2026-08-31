import jsPDF from "jspdf";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import logoSogit from "@/assets/logo-sogit.jpg.asset.json";
import { formatOperator } from "@/lib/format-operator";

export type ClinicalIntervention = {
  id: string;
  intervention_type: string;
  intervention_date: string;
  invio_in_ppi?: boolean | null;
  fuori_sede?: boolean | null;
  notes?: string | null;
  operator_username?: string | null;
  vs_pas?: number | null; vs_pad?: number | null; vs_fc?: number | null;
  vs_fr?: number | null; vs_spo2?: number | null;
  vs_temp?: number | null; vs_glicemia?: number | null;
  vitals_timeline?: any[] | null;
  extra_data?: Record<string, any> | null;
};

export type ClinicalPatient = {
  first_name: string;
  last_name: string;
  created_at?: string | null;
  notes?: string | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 46;

async function logoDataUrl(): Promise<string | null> {
  try {
    const blob = await (await fetch(logoSogit.url)).blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const vitalsParts = (v: Record<string, any>) => {
  const parts: string[] = [];
  if (v.vs_pas != null || v.vs_pad != null) parts.push(`PA ${v.vs_pas ?? "-"}/${v.vs_pad ?? "-"} mmHg`);
  if (v.vs_fc != null) parts.push(`FC ${v.vs_fc} bpm`);
  if (v.vs_fr != null) parts.push(`FR ${v.vs_fr}`);
  if (v.vs_spo2 != null) parts.push(`SpO2 ${v.vs_spo2}%`);
  if (v.vs_temp != null) parts.push(`T ${v.vs_temp} °C`);
  if (v.vs_glicemia != null) parts.push(`Glicemia ${v.vs_glicemia} mg/dL`);
  return parts;
};

/** Elenco rilevazioni T1..Tn con orario (T1 = ora intervento se non specificata). */
export function timelineOf(i: ClinicalIntervention) {
  const base = { vs_pas: i.vs_pas, vs_pad: i.vs_pad, vs_fc: i.vs_fc, vs_fr: i.vs_fr, vs_spo2: i.vs_spo2, vs_temp: i.vs_temp, vs_glicemia: i.vs_glicemia };
  const out: Array<{ label: string; at: string; parts: string[] }> = [];
  const t1 = vitalsParts(base);
  if (t1.length) out.push({ label: "T1", at: (i.extra_data?.t1_at as string) || format(new Date(i.intervention_date), "HH:mm"), parts: t1 });
  (Array.isArray(i.vitals_timeline) ? i.vitals_timeline : []).forEach((v: any) => {
    const parts = vitalsParts(v ?? {});
    if (parts.length) out.push({ label: `T${out.length + 1}`, at: v?.at ?? "", parts });
  });
  return out.map((x, idx) => ({ ...x, label: `T${idx + 1}` }));
}

export async function generateClinicalPdf(opts: {
  patientName: string;
  patient?: ClinicalPatient | null;
  interventions: ClinicalIntervention[];
  /** Se true il titolo è "Referto intervento" invece di "Cartella clinica". */
  single?: boolean;
}) {
  const { patientName, patient, interventions, single } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const logo = await logoDataUrl();
  let y = 0;

  const header = () => {
    doc.setFillColor(15, 41, 74);
    doc.rect(0, 0, PAGE_W, 78, "F");
    if (logo) doc.addImage(logo, "JPEG", PAGE_W - M - 44, 17, 44, 44);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text("S.O.G.IT. — Punto Blu Lignano", M, 34);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text("Documento sanitario riservato — uso interno", M, 50);
    doc.text(single ? "Referto intervento" : "Cartella clinica", M, 64);
    doc.setTextColor(0, 0, 0);
    y = 102;
  };

  const footer = () => {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p += 1) {
      doc.setPage(p);
      doc.setDrawColor(210); doc.setLineWidth(0.6);
      doc.line(M, PAGE_H - 42, PAGE_W - M, PAGE_H - 42);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(110);
      doc.text(`Generato il ${format(new Date(), "dd/MM/yyyy HH:mm")} · Documento contenente dati sanitari — trattare ai sensi del GDPR`, M, PAGE_H - 29);
      doc.text(`Pagina ${p} di ${pages}`, PAGE_W - M, PAGE_H - 29, { align: "right" });
      doc.setTextColor(0);
    }
  };

  const ensure = (needed: number) => {
    if (y + needed > PAGE_H - 60) { doc.addPage(); header(); }
  };

  header();

  // Anagrafica
  doc.setDrawColor(15, 41, 74); doc.setLineWidth(0.8);
  doc.setFillColor(242, 246, 252);
  doc.roundedRect(M, y, PAGE_W - M * 2, 62, 4, 4, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(patientName || "Paziente sconosciuto", M + 12, y + 22);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const meta = [
    patient?.created_at ? `Cartella aperta il ${format(new Date(patient.created_at), "dd/MM/yyyy")}` : null,
    `${interventions.length} intervent${interventions.length === 1 ? "o" : "i"} registrat${interventions.length === 1 ? "o" : "i"}`,
  ].filter(Boolean).join("  ·  ");
  doc.text(meta, M + 12, y + 40);
  if (patient?.notes) {
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(`Note cartella: ${patient.notes}`, PAGE_W - M * 2 - 24).slice(0, 1), M + 12, y + 54);
  }
  y += 82;

  const sorted = interventions.slice().sort((a, b) => (b.intervention_date ?? "").localeCompare(a.intervention_date ?? ""));

  for (const i of sorted) {
    const tl = timelineOf(i);
    const noteLines = i.notes ? doc.splitTextToSize(i.notes, PAGE_W - M * 2 - 24) : [];
    const blockH = 58 + tl.length * 26 + (noteLines.length ? 18 + noteLines.length * 11 : 0);
    ensure(blockH);

    doc.setDrawColor(206, 214, 226); doc.setLineWidth(0.8);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(M, y, PAGE_W - M * 2, blockH, 4, 4, "FD");
    doc.setFillColor(15, 41, 74);
    doc.rect(M, y, 4, blockH, "F");

    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0);
    doc.text(i.intervention_type, M + 16, y + 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); doc.setTextColor(90);
    doc.text(format(new Date(i.intervention_date), "EEEE d MMMM yyyy · HH:mm", { locale: it }), PAGE_W - M - 12, y + 20, { align: "right" });
    doc.setTextColor(0);
    doc.setFontSize(9);
    const flags = [
      `Operatore: ${formatOperator(i.operator_username) || "—"}`,
      `Invio PPI: ${i.invio_in_ppi ? "Sì" : "No"}`,
      `Fuori sede: ${i.fuori_sede ? "Sì" : "No"}`,
    ].join("   ·   ");
    doc.text(flags, M + 16, y + 38);

    let ly = y + 56;
    if (tl.length === 0) {
      doc.setFontSize(8.6); doc.setTextColor(120);
      doc.text("Nessun parametro vitale registrato.", M + 16, ly);
      doc.setTextColor(0);
    }
    for (const t of tl) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.4);
      doc.text(`${t.label}${t.at ? ` — ore ${t.at}` : ""}`, M + 16, ly);
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(t.parts.join("   ·   "), PAGE_W - M * 2 - 32).slice(0, 1), M + 16, ly + 12);
      ly += 26;
    }

    if (noteLines.length) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.4);
      doc.text("Note cliniche", M + 16, ly + 4);
      doc.setFont("helvetica", "normal");
      doc.text(noteLines, M + 16, ly + 16);
      ly += 16 + noteLines.length * 11;
    }

    y += blockH + 14;
  }

  ensure(70);
  doc.setDrawColor(150); doc.setLineWidth(0.6);
  doc.line(PAGE_W - M - 190, y + 40, PAGE_W - M, y + 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.4); doc.setTextColor(110);
  doc.text("Firma dell'operatore sanitario", PAGE_W - M, y + 52, { align: "right" });
  doc.setTextColor(0);

  footer();

  const safe = (patientName || "paziente").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const fileName = single
    ? `referto_${safe}_${format(new Date(sorted[0]?.intervention_date ?? Date.now()), "yyyyMMdd_HHmm")}.pdf`
    : `cartella_${safe}.pdf`;

  const blob = doc.output("blob") as Blob;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.rel = "noopener"; anchor.style.display = "none";
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { fileName, url };
}
