import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import logoSogit from "@/assets/logo-sogit.jpg.asset.json";

export type OfficeServiceRow = {
  id: string;
  patient_full_name: string | null;
  patient_initials: string | null;
  service_name: string;
  service_other: string | null;
  performed_at: string;
  username: string | null;
  notes: string | null;
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

export async function generateMonthlyOfficeReport(year: number, month: number, rows: OfficeServiceRow[]) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const logo = await fetchLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, "JPEG", 14, 10, 18, 18); } catch {}
  }

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Prestazioni ufficio Punto Blu", pageWidth / 2, 18, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const monthLabel = format(new Date(year, month - 1, 1), "LLLL yyyy", { locale: it });
  doc.text(`Resoconto mensile · ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`, pageWidth / 2, 25, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generato il ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: it })} · ${rows.length} prestazioni`, pageWidth / 2, 31, { align: "center" });
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 38,
    head: [["Data e ora", "Paziente / Iniziali", "Prestazione", "Operatore", "Note"]],
    body: rows.map((r) => [
      format(new Date(r.performed_at), "dd/MM/yyyy HH:mm", { locale: it }),
      r.patient_full_name ?? r.patient_initials ?? "—",
      r.service_other ? `${r.service_name} — ${r.service_other}` : r.service_name,
      r.username ?? "—",
      r.notes ?? "",
    ]),
    styles: { fontSize: 9, cellPadding: 2.5, valign: "middle" },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 42 },
      2: { cellWidth: 52 },
      3: { cellWidth: 28 },
      4: { cellWidth: "auto" },
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const current = data.pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`Pagina ${current} di ${pageCount}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 6, { align: "right" });
      doc.setTextColor(0);
    },
  });

  const filename = `prestazioni-ufficio-${year}-${String(month).padStart(2, "0")}.pdf`;
  doc.save(filename);
}
