import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import logoSogit from "@/assets/logo-sogit.jpg.asset.json";
import { formatOperator } from "@/lib/format-operator";

type Patient = { id: string; first_name: string; last_name: string };
type Intervention = {
  id: string;
  patient_id: string | null;
  intervention_type: string;
  intervention_date: string;
  invio_in_ppi: boolean;
  fuori_sede: boolean;
  notes: string | null;
  operator_username: string | null;
  vs_pas: number | null; vs_pad: number | null; vs_fc: number | null;
  vs_fr: number | null; vs_spo2: number | null;
  vs_temp: number | null; vs_glicemia: number | null;
};

const formatVitals = (i: Intervention) => {
  const parts: string[] = [];
  if (i.vs_pas != null || i.vs_pad != null) parts.push(`PA ${i.vs_pas ?? "-"}/${i.vs_pad ?? "-"}`);
  if (i.vs_fc != null) parts.push(`FC ${i.vs_fc}`);
  if (i.vs_fr != null) parts.push(`FR ${i.vs_fr}`);
  if (i.vs_spo2 != null) parts.push(`SpO2 ${i.vs_spo2}%`);
  if (i.vs_temp != null) parts.push(`T ${i.vs_temp}°`);
  if (i.vs_glicemia != null) parts.push(`Glic ${i.vs_glicemia}`);
  return parts.join(" · ");
};

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(logoSogit.url);
    const blob = await res.blob();
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

export async function generateDailyReport(date: string, interventions: Intervention[], patients: Patient[]) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const dateStr = format(new Date(date + "T00:00:00"), "EEEE d MMMM yyyy", { locale: it });

  const logoDataUrl = await fetchLogoDataUrl();
  if (logoDataUrl) {
    const size = 18;
    doc.addImage(logoDataUrl, "JPEG", pageWidth - size - 14, 8, size, size);
  }

  doc.setFontSize(16);
  doc.text("Resoconto giornaliero interventi", 14, 18);
  doc.setFontSize(11);
  doc.text(dateStr.charAt(0).toUpperCase() + dateStr.slice(1), 14, 26);
  doc.text(`Totale interventi: ${interventions.length}`, 14, 32);

  const rows = interventions.map((i) => {
    const p = patients.find((x) => x.id === i.patient_id);
    return [
      format(new Date(i.intervention_date), "HH:mm"),
      p ? `${p.last_name} ${p.first_name}` : "Paziente Sconosciuto",
      i.intervention_type,
      formatOperator(i.operator_username),
      i.invio_in_ppi ? "Sì" : "No",
      i.fuori_sede ? "Sì" : "No",
      formatVitals(i) || "—",
    ];
  });

  autoTable(doc, {
    startY: 38,
    head: [["Ora", "Paziente", "Intervento", "Operatore", "PPI", "Fuori sede", "Parametri"]],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246] },
    columnStyles: { 6: { cellWidth: 45 } },
  });

  doc.save(`resoconto_${date}.pdf`);
}
