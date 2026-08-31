import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const monthNames = ["GENNAIO","FEBBRAIO","MARZO","APRILE","MAGGIO","GIUGNO","LUGLIO","AGOSTO","SETTEMBRE","OTTOBRE","NOVEMBRE","DICEMBRE"];

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const fmtNum = (n: number, dec = 2) => (Number(n) || 0).toFixed(dec).replace(".", ",");
const fmtKm = (n: number | null | undefined) => {
  const v = Number(n || 0);
  if (v === 0) return "0,00";
  return v.toFixed(v >= 100 ? 1 : 2).replace(".", ",");
};

export type TransportRow = {
  kind: "intra" | "other" | "nurse";
  transport_date: string;
  first_name: string | null;
  last_name: string | null;
  departure_hospital_id: string | null;
  arrival_hospital_id: string | null;
  departure_text: string | null;
  arrival_text: string | null;
  kilometers: number | null;
  price: number | null;
  sosta_hours: number | null;
  sosta_price: number | null;
  nurse_hours: number | null;
  nurse_hourly: number | null;
  is_round_trip: boolean;
  annullato: boolean;
};
export type HospitalMap = Record<string, string>;

export function generateTransportsPDF(params: {
  year: number;
  month: number;
  rows: TransportRow[];
  hospitals: HospitalMap;
  fatturaNumero?: string;
  fatturaData?: string;
}) {
  const { year, month, rows, hospitals } = params;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;
  let y = 15;

  // ---- HEADER (Helvetica / Arial come nel modello ASUFC) ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("AZIENDA SANITARIA UNIVERSITARIA FRIULI CENTRALE - ASUFC", pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(12);
  doc.text("Via Pozzuolo, 330 – 33100 UDINE Cod. Fisc. e P. IVA 02985660303", pageWidth / 2, y, { align: "center" });
  y += 7;

  // Riga fattura con box gialli
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const fn = params.fatturaNumero || "";
  const fd = params.fatturaData || "";
  const label = "DETTAGLIO TRASPORTI ALLEGATO UNICO A FATTURA PA NUMERO:";
  const labelW = doc.getTextWidth(label);
  const gap = 2;
  const numW = 26;
  const midW = doc.getTextWidth(" del ");
  const dateW = 30;
  const totalW = labelW + gap + numW + midW + dateW;
  let cx = (pageWidth - totalW) / 2;
  doc.text(label, cx, y);
  doc.setFillColor(255, 242, 0);
  doc.rect(cx + labelW + gap, y - 4, numW, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.text(fn, cx + labelW + gap + numW / 2, y, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text(" del ", cx + labelW + gap + numW, y);
  doc.setFillColor(255, 242, 0);
  doc.rect(cx + labelW + gap + numW + midW, y - 4, dateW, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.text(fd, cx + labelW + gap + numW + midW + dateW / 2, y, { align: "center" });
  y += 9;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`MESE: ${monthNames[month - 1]} ${year}`, pageWidth / 2, y, { align: "center" });
  y += 10;

  const intra = rows.filter((r) => r.kind === "intra");
  const other = rows.filter((r) => r.kind === "other");
  const nurse = rows.filter((r) => r.kind === "nurse");

  const nomeCliente = (r: TransportRow) =>
    [r.last_name, r.first_name].filter(Boolean).join(" ").toUpperCase();
  const destLabel = (text: string | null | undefined, rt: boolean) => {
    const t = (text || "").toUpperCase().replace(/\s*X\s*2\s*$/i, "").trim();
    return `${t}${rt ? " X2" : ""}`.trim();
  };
  const LATISANA_DEPTS = new Set(["PS","PPI","MED","MED A","MED B","MED C","PED","ORT","ORL","CHI","GIN","DH","RSA","CARDIO","NEURO","ONCO","URO","OSTE","DIALISI"]);
  const isLatisanaDept = (t: string | null | undefined) =>
    !!t && LATISANA_DEPTS.has(t.trim().toUpperCase());
  const hospName = (id: string | null, txt: string | null) =>
    (id && hospitals[id]) || txt || "";

  // Palette esattamente ispirata al modello
  const TITLE_COLORS: Record<string, [number, number, number]> = {
    intra: [200, 60, 20],   // arancio-rosso
    other: [60, 140, 80],   // verde
    nurse: [200, 60, 20],   // arancio-rosso
  };
  const HEADER_FILLS: Record<string, [number, number, number]> = {
    intra: [220, 234, 246], // azzurro chiaro
    other: [223, 240, 219], // verde chiaro
    nurse: [253, 227, 210], // pesca chiaro
  };
  const NUM_COL_FILL: [number, number, number] = [235, 235, 235];
  const TOTAL_ROW_FILL: [number, number, number] = [242, 242, 242];

  const drawSection = (
    section: "intra" | "other" | "nurse",
    title: string,
    headings: string[],
    body: any[][],
    footer: string[],
    colWidths: number[],
    opts: {
      cancelledFlags?: boolean[]; // per riga (senza header/total)
      numCol?: boolean;
      totalRowIndex?: number; // indice riga total nel body
    } = {},
  ) => {
    if (y > 245) { doc.addPage(); y = 15; }
    const color = TITLE_COLORS[section];
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(12);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(title, marginX + 2, y);
    const tw = doc.getTextWidth(title);
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(0.4);
    doc.line(marginX + 2, y + 1, marginX + 2 + tw, y + 1);
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    y += 3;

    const columnStyles: Record<number, any> = {};
    colWidths.forEach((w, i) => (columnStyles[i] = { cellWidth: w, halign: i === 0 && opts.numCol ? "center" : undefined }));
    if (opts.numCol) columnStyles[0] = { ...columnStyles[0], fillColor: NUM_COL_FILL, fontStyle: "bold", halign: "center" };

    autoTable(doc, {
      startY: y,
      head: [headings],
      body,
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 1.6,
        lineColor: [130, 130, 130],
        lineWidth: 0.15,
        textColor: [0, 0, 0],
        valign: "middle",
      },
      headStyles: {
        fillColor: HEADER_FILLS[section],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        halign: "center",
        lineWidth: 0.2,
        lineColor: [130, 130, 130],
      },
      bodyStyles: { fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      theme: "grid",
      margin: { left: marginX, right: marginX },
      columnStyles,
      didParseCell: (data) => {
        if (data.section !== "body") return;
        // Riga TOTALI
        if (opts.totalRowIndex != null && data.row.index === opts.totalRowIndex) {
          data.cell.styles.fillColor = TOTAL_ROW_FILL;
          data.cell.styles.fontStyle = "bold";
          return;
        }
        // Colonna numero riga con fondo grigio
        if (opts.numCol && data.column.index === 0) {
          data.cell.styles.fillColor = NUM_COL_FILL;
          data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawCell: (data) => {
        if (data.section !== "body") return;
        if (opts.totalRowIndex != null && data.row.index === opts.totalRowIndex) return;
        const flags = opts.cancelledFlags || [];
        if (flags[data.row.index]) {
          // Strikethrough sull'intera riga
          const { x, y: cy, width, height } = data.cell;
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.25);
          doc.line(x + 0.5, cy + height / 2, x + width - 0.5, cy + height / 2);
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    for (const line of footer) {
      if (y > 285) { doc.addPage(); y = 15; }
      doc.text(line, marginX + 2, y);
      y += 5;
    }
    y += 3;
  };

  const pageAvail = pageWidth - marginX * 2;
  // Proporzioni derivate dal modello (colonne strette per numero e sosta)
  const widths9 = [8, 18, 42, 24, 30, 14, 20, 12, 15];
  const sum9 = widths9.reduce((a, b) => a + b, 0);
  const colW9 = widths9.map((w) => (w / sum9) * pageAvail);

  // ---------- INTRA ----------
  if (intra.length > 0) {
    const cancelledFlags: boolean[] = [];
    const body = intra.map((r, i) => {
      const dep = hospName(r.departure_hospital_id, r.departure_text).toUpperCase();
      const arr = hospName(r.arrival_hospital_id, r.arrival_text);
      cancelledFlags.push(!!r.annullato);
      return [
        String(i + 1),
        fmtDate(r.transport_date),
        nomeCliente(r),
        dep,
        destLabel(arr, r.is_round_trip),
        fmtKm(r.kilometers),
        fmtNum(r.price || 0, 3),
        fmtNum(r.sosta_hours || 0),
        fmtNum(r.sosta_price || 0),
      ];
    });

    const totKm = intra.reduce((s, r) => s + Number(r.kilometers || 0), 0);
    const totPrice = intra.reduce((s, r) => s + Number(r.price || 0), 0);
    const totSostaH = intra.reduce((s, r) => s + Number(r.sosta_hours || 0), 0);
    const totSostaEur = intra.reduce((s, r) => s + Number(r.sosta_price || 0), 0);
    const totalRowIndex = body.length;
    body.push(["", "", "", "", "", fmtKm(totKm), fmtNum(totPrice, 3), fmtNum(totSostaH), fmtNum(totSostaEur)]);
    cancelledFlags.push(false);
    const annull = intra.filter((r) => r.annullato).length;
    drawSection(
      "intra",
      "TRASPORTI OSPEDALIERI",
      ["", "DATA", "PAZIENTE", "REPARTO ORIGINE", "DESTINAZIONE", "KM", "TARIFFA €", "SOSTA", "€ SOSTA"],
      body,
      [
        `N. ${intra.length} VIAGGI${annull ? ` (DI CUI ${annull} ANNULLATI)` : ""}`,
        `TOT KM ${fmtKm(totKm)}`,
        `TOT ORE SOSTA ${fmtNum(totSostaH)}`,
        `TOT EURO ${fmtNum(totPrice + totSostaEur, 2)}`,
      ],
      colW9,
      { cancelledFlags, numCol: true, totalRowIndex },
    );
  }

  // ---------- ADI / ALTRI ----------
  if (other.length > 0) {
    const cancelledFlags: boolean[] = [];
    const body = other.map((r, i) => {
      const depRaw = hospName(r.departure_hospital_id, r.departure_text);
      const dep = isLatisanaDept(depRaw)
        ? `LATISANA (${depRaw.toUpperCase()})`
        : depRaw.toUpperCase();
      const arr = hospName(r.arrival_hospital_id, r.arrival_text);
      cancelledFlags.push(!!r.annullato);
      return [
        String(i + 1),
        fmtDate(r.transport_date),
        nomeCliente(r),
        dep,
        destLabel(arr, r.is_round_trip),
        fmtKm(r.kilometers),
        fmtNum(r.price || 0, 3),
        fmtNum(r.sosta_hours || 0),
        fmtNum(r.sosta_price || 0),
      ];
    });
    const totKm = other.reduce((s, r) => s + Number(r.kilometers || 0), 0);
    const totPrice = other.reduce((s, r) => s + Number(r.price || 0), 0);
    const totSostaH = other.reduce((s, r) => s + Number(r.sosta_hours || 0), 0);
    const totSostaEur = other.reduce((s, r) => s + Number(r.sosta_price || 0), 0);
    const totalRowIndex = body.length;
    body.push(["", "", "", "", "", fmtKm(totKm), fmtNum(totPrice, 3), fmtNum(totSostaH), fmtNum(totSostaEur)]);
    cancelledFlags.push(false);
    const annull = other.filter((r) => r.annullato).length;
    drawSection(
      "other",
      "TRASPORTI ADI",
      ["", "DATA", "PAZIENTE", "PARTENZA", "DESTINAZIONE", "KM", "TARIFFA €", "SOSTA", "€ SOSTA"],
      body,
      [
        `N. ${other.length} VIAGGI${annull ? ` (DI CUI ${annull} ANNULLATI)` : ""}`,
        `TOT KM ${fmtKm(totKm)}`,
        `TOT ORE SOSTA ${fmtNum(totSostaH)}`,
        `TOT EURO ${fmtNum(totPrice + totSostaEur, 2)}`,
      ],
      colW9,
      { cancelledFlags, numCol: true, totalRowIndex },
    );
  }

  // ---------- INFERMIERE ----------
  if (nurse.length > 0) {
    const widthsN = [18, 42, 30, 14, 12, 20];
    const sumN = widthsN.reduce((a, b) => a + b, 0);
    const colWN = widthsN.map((w) => (w / sumN) * pageAvail);
    const cancelledFlags: boolean[] = [];
    const body = nurse.map((r) => {
      cancelledFlags.push(!!r.annullato);
      return [
        fmtDate(r.transport_date),
        nomeCliente(r),
        (r.arrival_text || hospName(r.arrival_hospital_id, "")).toUpperCase(),
        fmtNum(r.nurse_hourly || 0),
        fmtNum(r.nurse_hours || 0),
        fmtNum(r.price || 0),
      ];
    });
    const totH = nurse.reduce((s, r) => s + Number(r.nurse_hours || 0), 0);
    const totE = nurse.reduce((s, r) => s + Number(r.price || 0), 0);
    const totalRowIndex = body.length;
    body.push(["", "", "", "TOT", fmtNum(totH), fmtNum(totE)]);
    cancelledFlags.push(false);
    drawSection(
      "nurse",
      "TRASPORTI CON INFERMIERE",
      ["DATA", "PAZIENTE", "DESTINAZIONE", "€/ora", "ORE", "€"],
      body,
      [],
      colWN,
      { cancelledFlags, totalRowIndex },
    );
  }

  // ---------- GRAN TOTALE ----------
  if (y > 260) { doc.addPage(); y = 15; }
  const grandAnn = rows.filter((r) => r.annullato).length;
  const grandKm = [...intra, ...other].reduce((s, r) => s + Number(r.kilometers || 0), 0);
  const grandEur = rows.reduce((s, r) => s + Number(r.price || 0) + Number(r.sosta_price || 0), 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`TOT VIAGGI ${intra.length}+${other.length}${grandAnn ? ` (DI CUI ${grandAnn} ANNULLATI)` : ""}`, marginX + 2, y); y += 6;
  doc.text(`TOT KM ${fmtKm(grandKm)}`, marginX + 2, y); y += 6;
  doc.text(`TOT EURO ${fmtNum(grandEur, 2)}`, marginX + 2, y);

  doc.save(`SECONDARI_${monthNames[month - 1].toLowerCase()}_${year}.pdf`);
}
