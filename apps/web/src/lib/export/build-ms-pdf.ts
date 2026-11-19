import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PaperHeader } from "@/db/schema";
import { rotatedPlacement, topDownToPdfLibY } from "@/lib/coords";
import { itemMarks, totalMarks, type Bank, type Item } from "@/lib/builder/model";
import { A4 } from "./layout";

/** One mark scheme row of a source question: label as printed ("2(a)(i)") and its boxes. */
export type MsRowInput = {
  label: string;
  partId: string | null;
  regions: { page: number; x0: number; y0: number; x1: number; y1: number }[];
};

export type MsExportInput = {
  title: string;
  header: PaperHeader;
  items: Item[];
  bank: Bank;
  /** Mark scheme rows per source question id, in mark-scheme order. */
  rows: Map<string, MsRowInput[]>;
  /** The mark scheme PDF of a source paper. */
  loadMarkScheme: (paperId: string) => Promise<Uint8Array>;
};

const MM = 72 / 25.4;
const MARGIN = 15 * MM;
const LABEL_W = 54;
const HEAD_H = 20;
const TOTAL_H = 18;
const LINE = rgb(0.25, 0.25, 0.25);

/** Which rows go with an item: all of them for a whole question, else the chosen parts' rows plus any whole-question rows. */
export function rowsForItem(item: Item, rows: MsRowInput[]): MsRowInput[] {
  if (!item.partIds.length) return rows;
  return rows.filter((r) => r.partId === null || item.partIds.includes(r.partId));
}

/** The row's label with the question's NEW number: "4(b)(ii)" for item 2 → "2(b)(ii)". */
export const renumber = (label: string, serial: number) => label.replace(/\s*\(drawn[^)]*\)\s*$/, "").replace(/^\s*\d+/, String(serial));

function safe(text: string, font: PDFFont) {
  let out = "";
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/**
 * The mark scheme for a built paper: for every question, its rows cropped from the boards' own
 * mark scheme (vector, like the paper), relabelled with the new question numbers, then our own
 * question totals and the paper total. Questions without a published mark scheme are listed at
 * the end instead of failing the export.
 */
export async function buildMarkSchemePdf(input: MsExportInput): Promise<{ pdf: Uint8Array; missing: number[] }> {
  const { header, items, bank } = input;
  const out = await PDFDocument.create();
  const sans = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const W = A4.w;
  const H = A4.h;
  const left = MARGIN;
  const right = W - MARGIN;
  const cropLeft = left + LABEL_W;
  const cropW = right - cropLeft;
  const bottom = H - MARGIN;
  const title = header.title || input.title;

  let page!: PDFPage;
  let y = 0;
  const text = (p: PDFPage, s: string, x: number, top: number, size: number, font = sans, color = rgb(0, 0, 0)) =>
    p.drawText(safe(s, font), { x, y: topDownToPdfLibY(top, size * 0.8, H), size, font, color });
  const box = (p: PDFPage, x: number, top: number, w: number, h: number) =>
    p.drawRectangle({ x, y: topDownToPdfLibY(top, h, H), width: w, height: h, borderColor: LINE, borderWidth: 0.6 });

  // Column headings at the top of every page, like the boards' tables.
  const headings = () => {
    page.drawRectangle({ x: left, y: topDownToPdfLibY(y, HEAD_H, H), width: right - left, height: HEAD_H, color: rgb(0.93, 0.93, 0.93), borderColor: LINE, borderWidth: 0.6 });
    page.drawLine({ start: { x: cropLeft, y: topDownToPdfLibY(y, 0, H) }, end: { x: cropLeft, y: topDownToPdfLibY(y + HEAD_H, 0, H) }, color: LINE, thickness: 0.6 });
    text(page, "Question", left + 6, y + 6, 9, bold);
    text(page, "Answer / guidance and marks", cropLeft + 6, y + 6, 9, bold);
    y += HEAD_H;
  };
  const newPage = () => {
    page = out.addPage([W, H]);
    y = MARGIN;
    headings();
  };

  // Page 1: title block, then the headings.
  page = out.addPage([W, H]);
  y = MARGIN;
  if (header.school) {
    const s = safe(header.school.toUpperCase(), bold);
    text(page, s, (W - bold.widthOfTextAtSize(s, 10)) / 2, y, 10, bold);
    y += 16;
  }
  const t = safe(`${title} — Mark scheme`, bold);
  text(page, t, (W - bold.widthOfTextAtSize(t, 15)) / 2, y, 15, bold);
  y += 22;
  const info = safe(`Total: ${totalMarks(items, bank)} marks`, sans);
  text(page, info, (W - sans.widthOfTextAtSize(info, 10)) / 2, y, 10);
  y += 22;
  headings();

  const sources = new Map<string, Promise<PDFDocument>>();
  const source = (paperId: string) => {
    let p = sources.get(paperId);
    if (!p) sources.set(paperId, (p = input.loadMarkScheme(paperId).then((b) => PDFDocument.load(b))));
    return p;
  };

  const missing: number[] = [];
  for (const [i, item] of items.entries()) {
    const serial = i + 1;
    const q = bank[item.questionId];
    const rows = q ? rowsForItem(item, input.rows.get(item.questionId) ?? []) : [];
    if (!rows.length) {
      missing.push(serial);
      continue;
    }
    const src = await source(q.paperId);
    for (const row of rows) {
      for (const [ri, g] of row.regions.entries()) {
        const srcPage = src.getPage(g.page);
        const crop = srcPage.getCropBox();
        const place = rotatedPlacement(g, srcPage.getRotation().angle, crop);
        const w = g.x1 - g.x0;
        const h = g.y1 - g.y0;
        const scale = Math.min(1, cropW / w, (bottom - MARGIN - HEAD_H - TOTAL_H) / h);
        const dh = h * scale;
        if (y + dh > bottom) newPage();
        const embedded = await out.embedPage(srcPage, place.box);
        const at = place.draw(cropLeft, topDownToPdfLibY(y, dh, H), w * scale, dh);
        page.drawPage(embedded, { ...at, rotate: degrees(at.rotate) });
        box(page, left, y, LABEL_W, dh);
        box(page, cropLeft, y, cropW, dh);
        if (ri === 0) text(page, renumber(row.label, serial), left + 6, y + 6, 10, bold);
        y += dh;
      }
    }
    // Our own question total.
    if (y + TOTAL_H > bottom) newPage();
    box(page, left, y, right - left, TOTAL_H);
    const marks = itemMarks(item, bank);
    const tot = safe(`Total for Question ${serial} = ${marks} mark${marks === 1 ? "" : "s"}`, bold);
    text(page, tot, right - 6 - bold.widthOfTextAtSize(tot, 9.5), y + 5, 9.5, bold);
    y += TOTAL_H + 6;
  }

  if (y + 30 > bottom) newPage();
  const total = safe(`TOTAL FOR PAPER = ${totalMarks(items, bank)} MARKS`, bold);
  text(page, total, right - bold.widthOfTextAtSize(total, 11), y + 6, 11, bold);
  y += 30;

  if (missing.length) {
    if (y + 40 > bottom) newPage();
    const note = `No mark scheme is available yet for question${missing.length === 1 ? "" : "s"} ${missing.join(", ")}.`;
    text(page, note, left, y + 6, 9.5, sans, rgb(0.6, 0.1, 0.1));
  }

  out.getPages().forEach((p, idx) => {
    const n = `${idx + 1}`;
    p.drawText(n, { x: (W - sans.widthOfTextAtSize(n, 9)) / 2, y: MARGIN / 2, size: 9, font: sans, color: rgb(0.35, 0.35, 0.35) });
  });
  out.setTitle(safe(`${title} — Mark scheme`, sans));
  out.setCreator("Papersmith");
  out.setProducer("Papersmith");
  return { pdf: await out.save(), missing };
}
