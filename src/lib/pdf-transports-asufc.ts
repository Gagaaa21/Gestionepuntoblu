import { jsPDF } from "jspdf";
import comicBoldUrl from "@/assets/asufc-fonts/comic-sans-bold.ttf?url";
import comicUrl from "@/assets/asufc-fonts/comic-sans.ttf?url";
import calibriUrl from "@/assets/asufc-fonts/calibri.ttf?url";
import calibriBoldUrl from "@/assets/asufc-fonts/calibri-bold.ttf?url";

import { hhmm, shortenName } from "@/lib/pdf-transports-format";


type TransportRow = {
  kind: "intra" | "other" | "nurse"; transport_date: string;
  first_name?: string | null; last_name?: string | null;
  first_name_2?: string | null; last_name_2?: string | null;
  departure_hospital_id?: string | null; arrival_hospital_id?: string | null;
  departure_text?: string | null; arrival_text?: string | null;
  kilometers?: number | null; price?: number | null; sosta_hours?: number | null;
  sosta_price?: number | null; nurse_hours?: number | null; nurse_hourly?: number | null;
  is_round_trip?: boolean | null; annullato?: boolean | null;
  departure_time?: string | null; arrival_time?: string | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ROW_H = 13.92;
const fmt = (value: number, decimals = 2) => Number(value || 0).toLocaleString("it-IT", { useGrouping: false, minimumFractionDigits: decimals, maximumFractionDigits: 3 });
const dateIt = (value: string) => { const [y, m, d] = value.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const months = ["GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];

async function fontBase64(url: string) {
  const buffer: ArrayBuffer = await fetch(url).then((response) => response.arrayBuffer());
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

const BODY_SIZE = 8.04;
const MIN_SIZE = 5.2;

function clipped(doc: jsPDF, value: string, width: number) {
  let text = value.toUpperCase();
  if (doc.getTextWidth(text) <= width) return text;
  while (text.length > 1 && doc.getTextWidth(`${text}.`) > width) text = text.slice(0, -1);
  return `${text}.`;
}

/** Draws text, shrinking the font (never the content) until it fits the column. */
function drawFit(doc: jsPDF, value: string, x: number, y: number, width: number, base = BODY_SIZE, min = MIN_SIZE) {
  const text = value.toUpperCase();
  let size = base;
  doc.setFontSize(size);
  while (size > min && doc.getTextWidth(text) > width) {
    size = Math.max(min, size - 0.2);
    doc.setFontSize(size);
  }
  doc.text(doc.getTextWidth(text) > width ? clipped(doc, text, width) : text, x, y);
  doc.setFontSize(base);
}


export async function generateTransportsPDF(params: { year: number; month: number; rows: TransportRow[]; hospitals: Record<string, string>; fatturaNumero?: string; fatturaData?: string }) {
  const { year, month, rows, hospitals } = params;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const [comicBold, comic, calibri, calibriBold] = await Promise.all([fontBase64(comicBoldUrl), fontBase64(comicUrl), fontBase64(calibriUrl), fontBase64(calibriBoldUrl)]);
  doc.addFileToVFS("ComicSans-Bold.ttf", comicBold); doc.addFont("ComicSans-Bold.ttf", "ComicSans", "bold");
  doc.addFileToVFS("ComicSans.ttf", comic); doc.addFont("ComicSans.ttf", "ComicSans", "normal");
  doc.addFileToVFS("Calibri.ttf", calibri); doc.addFont("Calibri.ttf", "Calibri", "normal");
  doc.addFileToVFS("Calibri-Bold.ttf", calibriBold); doc.addFont("Calibri-Bold.ttf", "Calibri", "bold");


  const hospital = (id?: string | null) => id ? hospitals[id] || "" : "";
  const point = (row: TransportRow, side: "departure" | "arrival") => {
    const text = side === "departure" ? row.departure_text : row.arrival_text;
    const id = side === "departure" ? row.departure_hospital_id : row.arrival_hospital_id;
    return (text || hospital(id) || "").trim();
  };
  const sortedRows = rows.slice().sort((a, b) => new Date(a.transport_date).getTime() - new Date(b.transport_date).getTime());
  const intra = sortedRows.filter((row) => row.kind === "intra");
  const adi = sortedRows.filter((row) => row.kind === "other");
  const nurse = sortedRows.filter((row) => row.kind === "nurse");
  let cursor = 0;
  const setBody = (bold = false) => { doc.setFont("Calibri", bold ? "bold" : "normal"); doc.setFontSize(8.04); doc.setTextColor(0, 0, 0); };
  const newPage = () => { doc.addPage(); cursor = 15; };
  const title = (label: string, color: [number, number, number]) => {
    if (cursor > PAGE_H - 60) newPage();
    doc.setFont("ComicSans", "bold"); doc.setFontSize(12); doc.setTextColor(...color); doc.text(label, 65.7, cursor);
    doc.setLineWidth(0.55); doc.line(65.7, cursor + 2.2, 65.7 + doc.getTextWidth(label), cursor + 2.2); cursor += 10.4;
  };

  doc.setFont("ComicSans", "bold"); doc.setTextColor(0, 0, 0); doc.setFontSize(12);
  doc.text("AZIENDA SANITARIA UNIVERSITARIA FRIULI CENTRALE - ASUFC", PAGE_W / 2, 49.4, { align: "center" });
  doc.text("Via Pozzuolo, 330 – 33100 UDINE Cod. Fisc. e P. IVA 02985660303", PAGE_W / 2, 67.7, { align: "center" });
  doc.setFont("ComicSans", "normal"); doc.setFontSize(9.96); doc.text("DETTAGLIO TRASPORTI ALLEGATO UNICO A FATTURA PA NUMERO:", 57.5, 85.1);
  doc.setFillColor(255, 255, 0); doc.rect(401.4, 76.4, 34.6, 11, "F"); doc.rect(453, 76.4, 34.6, 11, "F");
  if (params.fatturaNumero) { doc.setFont("ComicSans", "bold"); doc.setFontSize(9.96); doc.text(params.fatturaNumero, 401.4 + 34.6 / 2, 85.1, { align: "center" }); }
  if (params.fatturaData) { doc.setFont("ComicSans", "bold"); doc.setFontSize(9.96); doc.text(params.fatturaData, 453 + 34.6 / 2, 85.1, { align: "center" }); }
  doc.setFont("ComicSans", "bold"); doc.setFontSize(15.96); doc.text(`MESE: ${months[month - 1]} ${year}`, PAGE_W / 2, 106.7, { align: "center" }); cursor = 138.8;

  type Section = "intra" | "adi";
  const drawTableHeader = (section: Section) => {
    const xs = section === "intra" ? [17, 32, 78, 185, 255, 335, 370, 418, 448, 490, 530, 577] : [17, 40, 82, 190, 258, 335, 370, 418, 448, 490, 530, 577];
    const cols = section === "intra" ? ["", "DATA", "PAZIENTE", "REPARTO ORIGINE", "DESTINAZIONE", "KM", "TARIFFA €", "SOSTA", "€ SOSTA", "PART.", "ARR."] : ["", "DATA", "PAZIENTE", "PARTENZA", "DESTINAZIONE", "KM", "TARIFFA", "ORE", "€ SOSTA", "PART.", "ARR."];
    const fill: [number, number, number] = section === "intra" ? [217, 226, 243] : [226, 240, 217];
    doc.setFillColor(...fill); doc.rect(xs[0], cursor, xs.at(-1)! - xs[0], ROW_H, "F"); doc.setDrawColor(0); doc.setLineWidth(0.55);
    xs.forEach((x) => doc.line(x, cursor, x, cursor + ROW_H)); doc.line(xs[0], cursor, xs.at(-1)!, cursor); doc.line(xs[0], cursor + ROW_H, xs.at(-1)!, cursor + ROW_H);
    setBody(); cols.forEach((label, index) => drawFit(doc, label, xs[index] + 5, cursor + 10.6, xs[index + 1] - xs[index] - 7)); cursor += ROW_H; return xs;
  };

  const drawSection = (section: Section, sectionRows: TransportRow[]) => {
    title(section === "intra" ? "TRASPORTI OSPEDALIERI" : "TRASPORTI ADI", section === "intra" ? [31, 78, 121] : [61, 167, 80]);
    let xs = drawTableHeader(section);
    sectionRows.forEach((row, index) => {
      if (cursor + ROW_H > PAGE_H - 40) { newPage(); xs = drawTableHeader(section); }

      const rowFill: [number, number, number] = section === "intra" ? [189, 215, 238] : [198, 224, 180];
      doc.setFillColor(rowFill[0], rowFill[1], rowFill[2]); doc.rect(xs[0], cursor, xs[1] - xs[0], ROW_H, "F");
      doc.setDrawColor(0); doc.setLineWidth(0.55); xs.forEach((x) => doc.line(x, cursor, x, cursor + ROW_H)); doc.line(xs[0], cursor + ROW_H, xs.at(-1)!, cursor + ROW_H); setBody();
      const destText = point(row, "arrival");
      const nameWidth = xs[3] - xs[2] - 8;
      doc.setFontSize(MIN_SIZE);
      const hasSecond = !!(row.last_name_2 || row.first_name_2);
      const fits = (candidate: string) => doc.getTextWidth(candidate.toUpperCase()) <= nameWidth;
      const nameText = hasSecond
        ? (() => {
            const half = (candidate: string) => doc.getTextWidth(`${candidate.toUpperCase()} + `) <= nameWidth / 2 + 8;
            const a = shortenName(row.last_name, row.first_name, half);
            const b = shortenName(row.last_name_2, row.first_name_2, half);
            return [a, b].filter(Boolean).join(" + ");
          })()
        : shortenName(row.last_name, row.first_name, fits);
      doc.setFontSize(BODY_SIZE);
      const values = [String(index + 1), dateIt(row.transport_date), nameText, point(row, "departure"), destText, fmt(Number(row.kilometers || 0), 1), fmt(Number(row.price || 0), 2), fmt(Number(row.sosta_hours || 0), 2), fmt(Number(row.sosta_price || 0), 2), hhmm(row.departure_time), hhmm(row.arrival_time)];
      values.forEach((value, i) => {
        const colWidth = xs[i + 1] - xs[i] - 8;
        const x = xs[i] + (i === 0 ? 7 : 5);
        if (i === 4 && row.is_round_trip) {
          const x2w = doc.getTextWidth("X2") + 2;
          drawFit(doc, value, x, cursor + 10.7, colWidth - x2w - 2);
          doc.setTextColor(220, 38, 38);
          doc.text("X2", x + colWidth - x2w + 2, cursor + 10.7);
          doc.setTextColor(0, 0, 0);
        } else {
          drawFit(doc, value, x, cursor + 10.7, colWidth);
        }
      });


      if (row.annullato) { doc.setLineWidth(1); doc.line(xs[1], cursor + ROW_H / 2, xs.at(-1)!, cursor + ROW_H / 2); } cursor += ROW_H;
    });
    const km = sectionRows.reduce((sum, row) => sum + Number(row.kilometers || 0), 0); const fare = sectionRows.reduce((sum, row) => sum + Number(row.price || 0), 0);
    const hours = sectionRows.reduce((sum, row) => sum + Number(row.sosta_hours || 0), 0); const stop = sectionRows.reduce((sum, row) => sum + Number(row.sosta_price || 0), 0);
    if (cursor + 102 > PAGE_H) { newPage(); xs = drawTableHeader(section); }
    setBody(true); doc.text("TOTALI", xs[4] + 5, cursor + 10.7); doc.text(fmt(km, 1), xs[5] + 5, cursor + 10.7); doc.text(fmt(fare, 3), xs[6] + 5, cursor + 10.7); doc.text(fmt(hours, 1), xs[7] + 5, cursor + 10.7); doc.text(fmt(stop, 1), xs[8] + 5, cursor + 10.7);
    doc.setDrawColor(0); doc.setLineWidth(0.55);
    doc.line(xs[0], cursor, xs.at(-1)!, cursor);
    doc.line(xs[0], cursor + ROW_H, xs.at(-1)!, cursor + ROW_H); xs.forEach((x) => doc.line(x, cursor, x, cursor + ROW_H)); cursor += 27;

    if (cursor + 90 > PAGE_H) newPage();
    const cancelled = sectionRows.filter((row) => row.annullato).length; doc.setFont("Calibri", "normal"); doc.text(`N.   ${sectionRows.length} VIAGGI (DI CUI ${cancelled} ANNULLATI)`, 57, cursor);
    doc.setFont("Calibri", "bold"); doc.text(`TOT km ${fmt(km, 1)}`, 57, cursor + 27); doc.text(`TOT ORE SOSTA ${fmt(hours, 1)}`, 57, cursor + 54); doc.text(`TOT EURO ${fmt(fare + stop, 3)}`, 57, cursor + 81); cursor += 111;
  };

  drawSection("intra", intra); drawSection("adi", adi);
  if (nurse.length) {
    if (cursor + 55 + ROW_H * 2 > PAGE_H - 60) newPage(); title("TRASPORTI CON INFERMIERE", [237, 125, 49]);
    const xs = [47, 119, 248, 390, 426, 477, 530];
    const nurseHeader = () => {
      doc.setFillColor(252, 228, 214); doc.rect(xs[0], cursor, xs.at(-1)! - xs[0], ROW_H, "F"); doc.setDrawColor(0); doc.setLineWidth(0.55);
      xs.forEach((x) => doc.line(x, cursor, x, cursor + ROW_H)); doc.line(xs[0], cursor, xs.at(-1)!, cursor); doc.line(xs[0], cursor + ROW_H, xs.at(-1)!, cursor + ROW_H); setBody();
      ["DATA", "PAZIENTE", "DESTINAZIONE", "€/ora", "ORE", "€"].forEach((label, i) => drawFit(doc, label, xs[i] + 7, cursor + 10.7, xs[i + 1] - xs[i] - 10)); cursor += ROW_H;
    };
    nurseHeader();
    nurse.forEach((row) => { const rate = Number(row.nurse_hourly || 0); const hours = Number(row.nurse_hours || 0); const price = Number(row.price || rate * hours); setBody();
      if (cursor + ROW_H > PAGE_H - 40) { newPage(); nurseHeader(); setBody(); }
      doc.setFontSize(MIN_SIZE);
      const nurseName = shortenName(row.last_name, row.first_name, (candidate) => doc.getTextWidth(candidate.toUpperCase()) <= xs[2] - xs[1] - 10);
      doc.setFontSize(BODY_SIZE);
      [dateIt(row.transport_date), nurseName, point(row, "arrival"), fmt(rate, 2), fmt(hours, 1), fmt(price, 2)].forEach((value, i) => drawFit(doc, value, xs[i] + 7, cursor + 10.7, xs[i + 1] - xs[i] - 10));

      xs.forEach((x) => doc.line(x, cursor, x, cursor + ROW_H)); doc.line(xs[0], cursor + ROW_H, xs.at(-1)!, cursor + ROW_H); cursor += ROW_H; });
    const hours = nurse.reduce((sum, row) => sum + Number(row.nurse_hours || 0), 0); const total = nurse.reduce((sum, row) => sum + Number(row.price || 0), 0); setBody(true);
    if (cursor + ROW_H + 60 > PAGE_H) newPage();
    doc.text("TOT", xs[3] + 7, cursor + 10.7); doc.text(fmt(hours, 1), xs[4] + 7, cursor + 10.7); doc.text(fmt(total, 1), xs[5] + 7, cursor + 10.7); doc.line(xs[3], cursor + ROW_H, xs.at(-1)!, cursor + ROW_H); xs.slice(3).forEach((x) => doc.line(x, cursor, x, cursor + ROW_H)); cursor += 60;
  }

  const allTrips = intra.length + adi.length; const cancelled = [...intra, ...adi].filter((row) => row.annullato).length; const allKm = [...intra, ...adi].reduce((sum, row) => sum + Number(row.kilometers || 0), 0); const allEuro = rows.reduce((sum, row) => sum + Number(row.price || 0) + Number(row.sosta_price || 0), 0);
  if (cursor + 60 > PAGE_H) newPage();
  doc.setFont("Calibri", "bold"); doc.setFontSize(14.04); doc.setTextColor(0, 0, 0); doc.text(`TOT VIAGGI ${adi.length}+${intra.length} (DI CUI ${cancelled} ANNULLATI)`, 56.6, cursor); doc.text(`TOT KM ${fmt(allKm, 1)}`, 56.6, cursor + 27); doc.text(`TOT EURO ${fmt(allEuro, 1)}`, 56.6, cursor + 54);

  const fileName = `SECONDARI_${months[month - 1].toLowerCase()}_${year}.pdf`;
  return savePdf(doc, fileName);
}

/**
 * Download robusto: dentro l'iframe di anteprima `doc.save()` può essere bloccato,
 * quindi si usa un blob URL con anchor e, se il download non parte, una nuova scheda.
 */
function savePdf(doc: jsPDF, fileName: string) {
  const blob = doc.output("blob") as Blob;
  const url = URL.createObjectURL(blob);
  let opened = false;
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    opened = true;
  } catch {
    opened = false;
  }
  if (!opened) window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { fileName, url };
}
