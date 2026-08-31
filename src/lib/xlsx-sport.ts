export type SportAsset = {
  type: string;
  vehicle_code: string;
  crew: number | string;
  driver: string;
  rescuers: string;
  start_time?: string | null;
  end_time?: string | null;
};
export type SportCrewChange = {
  time?: string | null;
  end_time?: string | null;
  kind?: string;
  vehicle_code?: string;
  driver?: string;
  rescuers?: string;
  note?: string;
};
export type SportRow = {
  event_date: string;
  event_name: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  assets: SportAsset[];
  crew_changes?: SportCrewChange[];
  doctor_name: string | null;
  meal_voucher: boolean;
  als_backpack: boolean;
  paid?: boolean;
  color: string;
  notes: string | null;
  done: boolean;
};

const hhmm = (v?: string | null) => (v ? String(v).slice(0, 5) : "");
const argb = (hex: string) => `FF${(hex || "#334155").replace("#", "").toUpperCase().padEnd(6, "0").slice(0, 6)}`;

/** Sigla compatta: per le ambulanze si usa solo il codice mezzo (M12), non "Ambulanza M12". */
export function assetLabel(a: SportAsset) {
  const code = (a.vehicle_code || "").trim().toUpperCase();
  const type = (a.type || "").trim();
  const base = /ambulanza/i.test(type) ? code || "Ambulanza" : [type, code].filter(Boolean).join(" ");
  const window = hhmm(a.start_time) || hhmm(a.end_time) ? ` (${hhmm(a.start_time) || "—"}–${hhmm(a.end_time) || "—"})` : "";
  return `${base}${window}`;
}

function luminance(hex: string) {
  const h = (hex || "#334155").replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2) || "33", 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export async function exportSportXLSX(params: { rows: SportRow[]; monthLabel: string; year: number; filename: string }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "S.O.G.IT. Lignano";
  const ws = wb.addWorksheet(`${params.monthLabel} ${params.year}`, {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const columns = [
    { header: "Data", key: "d", width: 12 },
    { header: "Evento", key: "n", width: 30 },
    { header: "Inizio", key: "s", width: 8 },
    { header: "Fine", key: "e", width: 8 },
    { header: "Location", key: "l", width: 26 },
    { header: "Mezzi", key: "m", width: 30 },
    { header: "Pers.", key: "p", width: 7 },
    { header: "Autisti", key: "a", width: 22 },
    { header: "Soccorritori", key: "r", width: 30 },
    { header: "Cambi equipaggio", key: "c", width: 34 },
    { header: "Medico", key: "doc", width: 18 },
    { header: "B. pasto", key: "bp", width: 9 },
    { header: "ALS", key: "als", width: 7 },
    { header: "Pagato", key: "pay", width: 9 },
    { header: "Svolto", key: "done", width: 9 },
    { header: "Note", key: "note", width: 40 },
  ];
  ws.columns = columns as any;

  // Titolo
  ws.mergeCells(1, 1, 1, columns.length);
  const title = ws.getCell(1, 1);
  title.value = `SERVIZI SPORTIVI · S.O.G.IT. LIGNANO · ${params.monthLabel.toUpperCase()} ${params.year}`;
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14213D" } };
  ws.getRow(1).height = 26;
  ws.getRow(2).height = 6;

  // Intestazioni
  const head = ws.getRow(3);
  columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3B63" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin", color: { argb: "FFFFFFFF" } }, bottom: { style: "thin", color: { argb: "FFFFFFFF" } }, left: { style: "thin", color: { argb: "FFFFFFFF" } }, right: { style: "thin", color: { argb: "FFFFFFFF" } } };
  });
  head.height = 22;

  for (const s of params.rows) {
    const crewChanges = (s.crew_changes ?? [])
      .map((c) => [[hhmm(c.time), hhmm(c.end_time)].filter(Boolean).join("–"), c.kind, c.vehicle_code, [c.driver, c.rescuers].filter(Boolean).join(" / "), c.note].filter(Boolean).join(" · "))
      .join("\n");
    const row = ws.addRow({
      d: new Date(s.event_date + "T00:00:00").toLocaleDateString("it-IT"),
      n: s.event_name,
      s: hhmm(s.start_time),
      e: hhmm(s.end_time),
      l: s.location ?? "",
      m: (s.assets ?? []).map(assetLabel).join(" + "),
      p: (s.assets ?? []).reduce((n, a) => n + (Number(a.crew) || 0), 0),
      a: (s.assets ?? []).map((a) => a.driver).filter(Boolean).join(" / "),
      r: (s.assets ?? []).map((a) => a.rescuers).filter(Boolean).join(" / "),
      c: crewChanges,
      doc: s.doctor_name ?? "",
      bp: s.meal_voucher ? "SÌ" : "—",
      als: s.als_backpack ? "SÌ" : "—",
      pay: s.paid ? "SÌ" : "—",
      done: s.done ? "SÌ" : "—",
      note: s.notes ?? "",
    });

    const fill = argb(s.color);
    const light = luminance(s.color) > 0.62;
    row.height = crewChanges ? 30 : 20;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.font = { name: "Calibri", size: 10, color: { argb: light ? "FF111111" : "FFFFFFFF" }, bold: col === 2 };
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: [1, 3, 4, 7, 12, 13, 14, 15].includes(col) ? "center" : "left",
      };
      cell.border = { top: { style: "hair", color: { argb: "FFFFFFFF" } }, bottom: { style: "hair", color: { argb: "FFFFFFFF" } }, left: { style: "hair", color: { argb: "FFFFFFFF" } }, right: { style: "hair", color: { argb: "FFFFFFFF" } } };
    });
  }

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } };

  // Riepilogo
  ws.addRow([]);
  const totals = ws.addRow([
    "TOTALI", `${params.rows.length} servizi`, "", "", "",
    `${params.rows.filter((r) => r.done).length} svolti`,
    params.rows.reduce((n, s) => n + (s.assets ?? []).reduce((k, a) => k + (Number(a.crew) || 0), 0), 0),
    "", "", "", "",
    `${params.rows.filter((r) => r.meal_voucher).length}`,
    `${params.rows.filter((r) => r.als_backpack).length}`,
    `${params.rows.filter((r) => r.paid).length}`,
    `${params.rows.filter((r) => r.done).length}`,
    "",
  ]);
  totals.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14213D" } };
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  totals.height = 22;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = params.filename;
  a.click();
  URL.revokeObjectURL(url);
}
