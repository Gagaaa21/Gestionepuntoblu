export type ParsedTransportRow = {
  kind: "intra" | "other" | "nurse";
  date: string;
  first_name: string;
  last_name: string;
  first_name_2?: string;
  last_name_2?: string;
  departure: string;
  arrival: string;
  kilometers: number;
  price: number;
  sosta_hours: number;
  sosta_price: number;
  is_round_trip: boolean;
  annullato: boolean;
  nurse_hours: number;
  nurse_hourly: number;
  notes: string;
};

type PositionedText = { x: number; y: number; text: string };

const asNumber = (value = "") => {
  const parsed = Number(value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const isoDate = (value: string) => {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
};

const splitOne = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { last_name: parts.shift() ?? "", first_name: parts.join(" ") };
};

/** Gestisce anche i viaggi con due pazienti ("ROSSI M. + BIANCHI L."). */
const splitPatient = (value: string) => {
  const [a, b] = value.split(/\s*(?:\+|\/|&)\s*/);
  const first = splitOne(a ?? "");
  if (!b?.trim()) return first;
  const second = splitOne(b);
  return { ...first, last_name_2: second.last_name, first_name_2: second.first_name };
};

const valueAt = (items: PositionedText[], min: number, max: number) =>
  items.filter((item) => item.x >= min && item.x < max).map((item) => item.text).join(" ").trim();

const numericValuesFrom = (items: PositionedText[], minX: number) =>
  items
    .filter((item) => item.x >= minX && /\d/.test(item.text))
    .sort((a, b) => a.x - b.x)
    .map((item) => asNumber(item.text));

const isCancelled = (item: any) => {
  const transform = Array.isArray(item.transform) ? item.transform : [];
  return transform.length >= 4 && Math.abs(Number(transform[3]) || 0) < 0.5;
};

async function collectStrikeYs(page: any, pdfjs: any): Promise<number[]> {
  try {
    const ops = await page.getOperatorList();
    const fn = ops.fnArray as number[];
    const args = ops.argsArray as any[];
    const OPS = pdfjs.OPS;
    if (!OPS) return [];
    const STROKE_OPS = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter((v) => v != null));
    const ys: number[] = [];
    let pending: { minY: number; maxY: number; width: number } | null = null;
    for (let i = 0; i < fn.length; i += 1) {
      const code = fn[i];
      if (code === OPS.constructPath) {
        const [subFns, subArgs] = args[i] as [number[], number[]];
        let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
        let idx = 0;
        for (const sub of subFns) {
          if (sub === OPS.moveTo || sub === OPS.lineTo) {
            const x = subArgs[idx++]; const y = subArgs[idx++];
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
          } else if (sub === OPS.rectangle) {
            idx += 4;
          } else if (sub === OPS.curveTo) {
            idx += 6;
          } else if (sub === OPS.curveTo2 || sub === OPS.curveTo3) {
            idx += 4;
          }
        }
        if (isFinite(minY)) pending = { minY, maxY, width: maxX - minX };
      } else if (STROKE_OPS.has(code) && pending) {
        if (Math.abs(pending.maxY - pending.minY) < 1.5 && pending.width > 100) {
          ys.push((pending.minY + pending.maxY) / 2);
        }
        pending = null;
      }
    }
    return ys;
  } catch { return []; }
}

export async function parseAsufcPdf(file: File): Promise<ParsedTransportRow[] | null> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes, disableWorker: !pdfjs.GlobalWorkerOptions.workerSrc }).promise;
  const rows: ParsedTransportRow[] = [];
  let section: ParsedTransportRow["kind"] | null = null;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const strikeYs = await collectStrikeYs(page, pdfjs);
    const grouped: Array<{ y: number; items: PositionedText[]; cancelled: boolean }> = [];

    for (const raw of content.items as any[]) {
      const text = typeof raw.str === "string" ? raw.str.trim() : "";
      if (!text || !Array.isArray(raw.transform)) continue;
      const x = Number(raw.transform[4]) || 0;
      const y = Number(raw.transform[5]) || 0;
      let line = grouped.find((candidate) => Math.abs(candidate.y - y) < 1.6);
      if (!line) {
        line = { y, items: [], cancelled: false };
        grouped.push(line);
      }
      line.items.push({ x, y, text });
      line.cancelled ||= isCancelled(raw);
    }

    for (const line of grouped) {
      if (strikeYs.some((sy) => Math.abs(sy - line.y) < 6)) line.cancelled = true;
    }

    grouped.sort((a, b) => b.y - a.y);
    for (const line of grouped) {
      line.items.sort((a, b) => a.x - b.x);
      const joined = line.items.map((item) => item.text).join(" ").toUpperCase();
      const cancelledByText = /\b(?:ANNULLAT[OA]|CANCELLAT[OA]|DISDETT[OA])\b/.test(joined);
      if (joined.includes("TRASPORTI OSPEDALIERI")) { section = "intra"; continue; }
      if (joined.includes("TRASPORTI ADI")) { section = "other"; continue; }
      if (joined.includes("TRASPORTI CON INFERMIERE")) { section = "nurse"; continue; }
      if (!section) continue;

      if (section === "nurse") {
        const dateText = valueAt(line.items, 40, 125);
        const date = isoDate(dateText);
        if (!date) continue;
        const patient = splitPatient(valueAt(line.items, 120, 255));
        // Il modello infermieri ha le colonne: destinazione, tariffa oraria,
        // ore, totale. Le coordinate cambiano leggermente tra pagine, quindi
        // leggiamo i tre valori numerici in ordine invece di finestre rigide.
        const [nurseHourly = 0, nurseHours = 0, nurseTotal = 0] = numericValuesFrom(line.items, 385);
        rows.push({
          kind: section, date, ...patient,
          departure: "", arrival: valueAt(line.items, 250, 385),
          kilometers: 0, price: nurseTotal,
          sosta_hours: 0, sosta_price: 0, is_round_trip: false,
          annullato: line.cancelled || cancelledByText, nurse_hours: nurseHours,
          nurse_hourly: nurseHourly, notes: "",
        });
        continue;
      }


      const dateMin = section === "intra" ? 35 : 40;
      const patientMin = section === "intra" ? 100 : 105;
      const departureMin = section === "intra" ? 225 : 230;
      const arrivalMin = section === "intra" ? 315 : 308;
      const date = isoDate(valueAt(line.items, dateMin, patientMin));
      if (!date) continue;
      const patient = splitPatient(valueAt(line.items, patientMin, departureMin));
      const rawArrival = valueAt(line.items, arrivalMin, 405);
      const roundTrip = /\bX\s*2\b|\bA\/?R\b/i.test(rawArrival);
      // Nel PDF reale i valori iniziano a x≈410 (km), 451 (tariffa),
      // 510 (sosta) e 545 (€ sosta). Leggerli in ordine rende il parser
      // robusto anche alle piccole variazioni di impaginazione tra pagine.
      const [kilometers = 0, price = 0, sostaHours = 0, sostaPrice = 0] = numericValuesFrom(line.items, 400);
      rows.push({
        kind: section, date, ...patient,
        departure: valueAt(line.items, departureMin, arrivalMin),
        arrival: rawArrival.replace(/\s*(?:X\s*2|A\/?R)\s*$/i, "").trim(),
        // Nel modello ASUFC KM e tariffa sono già il totale effettivo, anche per X2.
        kilometers,
        price,
        sosta_hours: sostaHours,
        sosta_price: sostaPrice,
        is_round_trip: roundTrip, annullato: line.cancelled || cancelledByText,
        nurse_hours: 0, nurse_hourly: 0, notes: "",
      });
    }
  }

  const recognized = rows.length > 0 && rows.some((row) => row.kind === "intra" || row.kind === "other");
  return recognized ? rows : null;
}
/**
 * Estrae il testo del PDF nel browser (riga per riga), così l'import assistito
 * può inviare all'AI poco testo invece di megabyte di base64.
 */
export async function extractPdfText(file: File, maxChars = 120_000): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes, disableWorker: !pdfjs.GlobalWorkerOptions.workerSrc }).promise;
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const lines = new Map<number, PositionedText[]>();
    for (const raw of content.items as any[]) {
      const text = typeof raw.str === "string" ? raw.str.trim() : "";
      if (!text || !Array.isArray(raw.transform)) continue;
      const y = Math.round((Number(raw.transform[5]) || 0) / 2) * 2;
      const arr = lines.get(y) ?? [];
      arr.push({ x: Number(raw.transform[4]) || 0, y, text });
      lines.set(y, arr);
    }
    const ordered = Array.from(lines.entries()).sort((a, b) => b[0] - a[0]);
    for (const [, items] of ordered) {
      out.push(items.sort((a, b) => a.x - b.x).map((i) => i.text).join("  "));
    }
    if (out.join("\n").length > maxChars) break;
  }
  return out.join("\n").slice(0, maxChars);
}
