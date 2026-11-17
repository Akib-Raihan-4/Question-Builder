import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { PaperHeader } from "@/db/schema";
import { pdfToPdfLib, topDownToPdfLibY } from "@/lib/coords";
import { itemMarks, itemRegions, totalMarks, type Bank, type Item } from "@/lib/builder/model";
import { A4, DEFAULT_LAYOUT, layoutPaper } from "./layout";

export type ExportInput = {
  title: string;
  header: PaperHeader;
  items: Item[];
  bank: Bank;
  /** Original PDF bytes for a source paper. */
  loadSource: (paperId: string) => Promise<Uint8Array>;
};

/** Standard PDF fonts only cover Latin-1; replace anything else so export never fails. */
function safe(text: string, font: PDFFont) {
  let out = "";
  for (const ch of text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxW && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Build the exported question paper. Every crop is the ORIGINAL PDF page embedded as a form
 * XObject clipped to the stored region, so text and drawings stay vector (selectable, sharp).
 * The old question numbers and Total lines are outside the regions; we draw our own.
 */
export async function buildPaperPdf(input: ExportInput): Promise<Uint8Array> {
  const { header, items, bank } = input;
  const out = await PDFDocument.create();
  const timesBold = await out.embedFont(StandardFonts.TimesRomanBold);
  const sans = await out.embedFont(StandardFonts.Helvetica);
  const sansBold = await out.embedFont(StandardFonts.HelveticaBold);
  const L = DEFAULT_LAYOUT;
  const contentW = A4.w - 2 * L.margin;
  const paperTotal = totalMarks(items, bank);

  // ---- Header block (first page) -------------------------------------------------------
  type Line = { text: string; font: PDFFont; size: number; align: "center" | "left"; gapAfter: number };
  const headerLines: Line[] = [];
  if (header.school) headerLines.push({ text: header.school.toUpperCase(), font: sansBold, size: 11, align: "center", gapAfter: 6 });
  headerLines.push({ text: header.title || input.title, font: sansBold, size: 16, align: "center", gapAfter: 8 });
  const info = [
    header.className && `Class: ${header.className}`,
    header.timeAllowed && `Time: ${header.timeAllowed}`,
    `Total: ${paperTotal} marks`,
  ].filter(Boolean).join("     ");
  headerLines.push({ text: info, font: sans, size: 10, align: "center", gapAfter: 10 });
  for (const l of headerLines) l.text = safe(l.text, l.font);
  const instructions = header.instructions
    ? wrap(header.instructions.split(/\r?\n/).map((para) => safe(para, sans)).join("\n"), sans, 9.5, contentW).map(
        (text): Line => ({ text, font: sans, size: 9.5, align: "left", gapAfter: 3 }),
      )
    : [];
  const allHeader = [...headerLines, ...instructions];
  const headerHeight = allHeader.reduce((h, l) => h + l.size + l.gapAfter, 0) + 16;

  // ---- Layout ------------------------------------------------------------------------------
  const regionsPerItem = items.map((it) => itemRegions(it, bank));
  const layout = layoutPaper(
    regionsPerItem.map((rs) => rs.map((r) => ({ w: r.x1 - r.x0, h: r.y1 - r.y0 }))),
    headerHeight,
  );
  const pages = Array.from({ length: layout.pages }, () => out.addPage([A4.w, A4.h]));
  const H = A4.h;

  // Header
  let y = L.margin;
  for (const l of allHeader) {
    const w = l.font.widthOfTextAtSize(l.text, l.size);
    const x = l.align === "center" ? (A4.w - w) / 2 : L.margin;
    pages[0].drawText(l.text, { x, y: topDownToPdfLibY(y, l.size, H), size: l.size, font: l.font });
    y += l.size + l.gapAfter;
  }
  if (items.length) {
    pages[0].drawLine({
      start: { x: L.margin, y: topDownToPdfLibY(y + 4, 0, H) },
      end: { x: A4.w - L.margin, y: topDownToPdfLibY(y + 4, 0, H) },
      thickness: 0.75,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  // ---- Crops -------------------------------------------------------------------------------
  const sources = new Map<string, Promise<PDFDocument>>();
  const sourceDoc = (paperId: string) => {
    let p = sources.get(paperId);
    if (!p) {
      p = input.loadSource(paperId).then((bytes) => PDFDocument.load(bytes));
      sources.set(paperId, p);
    }
    return p;
  };

  for (const pl of layout.placements) {
    const q = bank[items[pl.item].questionId];
    const region = regionsPerItem[pl.item][pl.region];
    const src = await sourceDoc(q.paperId);
    const srcPage = src.getPage(region.page);
    const crop = srcPage.getCropBox();
    const box = pdfToPdfLib(region, crop.height, { x: crop.x, y: crop.y });
    const embedded = await out.embedPage(srcPage, box);
    pages[pl.page].drawPage(embedded, { x: pl.x, y: topDownToPdfLibY(pl.top, pl.h, H), width: pl.w, height: pl.h });
  }

  // ---- New numbers and Total lines (Edexcel style) ----------------------------------------
  for (const n of layout.numbers) {
    const label = String(n.item + 1); // serial = position + 1, never stored
    pages[n.page].drawText(label, { x: layout.contentLeft, y: topDownToPdfLibY(n.top + 2, 11, H), size: 12, font: timesBold });
  }
  for (const t of layout.totals) {
    const marks = itemMarks(items[t.item], bank);
    const text = `(Total for Question ${t.item + 1} is ${marks} mark${marks === 1 ? "" : "s"})`;
    const w = timesBold.widthOfTextAtSize(text, 11);
    pages[t.page].drawText(text, { x: layout.contentRight - w, y: topDownToPdfLibY(t.top, 11, H), size: 11, font: timesBold });
  }
  if (layout.paperTotal) {
    const text = `TOTAL FOR PAPER IS ${paperTotal} MARKS`;
    const w = timesBold.widthOfTextAtSize(text, 12);
    pages[layout.paperTotal.page].drawText(text, {
      x: layout.contentRight - w,
      y: topDownToPdfLibY(layout.paperTotal.top + 8, 12, H),
      size: 12,
      font: timesBold,
    });
  }

  // ---- Footer: page numbers ---------------------------------------------------------------
  pages.forEach((p, i) => {
    const text = `${i + 1}`;
    const w = sans.widthOfTextAtSize(text, 9);
    p.drawText(text, { x: (A4.w - w) / 2, y: topDownToPdfLibY(A4.h - L.margin / 2, 9, H), size: 9, font: sans, color: rgb(0.35, 0.35, 0.35) });
  });

  out.setTitle(safe(header.title || input.title, sans));
  out.setCreator("Papersmith");
  out.setProducer("Papersmith");
  return out.save();
}
