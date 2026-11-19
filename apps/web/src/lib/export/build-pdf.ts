import { BlendMode, PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { PaperHeader } from "@/db/schema";
import { pdfToPdfLib, topDownToPdfLibY } from "@/lib/coords";
import { itemMarks, itemRegions, totalMarks, type Bank, type Item } from "@/lib/builder/model";
import { A4, DEFAULT_LAYOUT, layoutPaper } from "./layout";
import type { ExportBranding, LogoImage } from "@/lib/watermark";
import { fadePngToWhite } from "./fade-png";

async function embedLogo(out: PDFDocument, img: LogoImage): Promise<PDFImage | null> {
  try {
    return img.type === "image/png" ? await out.embedPng(img.bytes) : await out.embedJpg(img.bytes);
  } catch {
    return null; // a broken image never stops the export
  }
}

export type ExportInput = {
  title: string;
  header: PaperHeader;
  items: Item[];
  bank: Bank;
  /** Original PDF bytes for a source paper. */
  loadSource: (paperId: string) => Promise<Uint8Array>;
  /** The owner's school logo and watermark, already filtered by the paper's switches. */
  branding?: ExportBranding;
};


const LOGO_MAX_H = 40; // pt (~14 mm)
const LOGO_GAP = 8;

/**
 * Faint watermark across the page, drawn ON TOP of the questions with "multiply" blending so it
 * shows even on pages that paint a white background, while the text underneath stays readable.
 */
function drawWatermark(page: PDFPage, wm: NonNullable<ExportBranding["watermark"]>, font: PDFFont, logo: PDFImage | null) {
  const { width: W, height: H } = page.getSize();
  if (logo) {
    const w = W * 0.6;
    const h = (logo.height / logo.width) * w;
    // A PNG logo arrives already faded (see fadePngToWhite); a JPEG relies on the opacity setting.
    const opacity = wm.logo?.type === "image/png" ? 1 : wm.opacity;
    page.drawImage(logo, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h, opacity, blendMode: BlendMode.Multiply });
    return;
  }
  if (!wm.text) return;
  const text = safe(wm.text.toUpperCase(), font);
  // Fill ~60% of the page diagonal, never huge (the builder preview uses the same rule).
  const size = Math.min(W * 0.13, (Math.hypot(W, H) * 0.6) / font.widthOfTextAtSize(text, 1));
  const tw = font.widthOfTextAtSize(text, size);
  const th = font.heightAtSize(size, { descender: false });
  const a = Math.PI / 4;
  // Rotate about the text's own centre, placed at the page centre.
  const x = W / 2 - (tw / 2) * Math.cos(a) + (th / 2) * Math.sin(a);
  const y = H / 2 - (tw / 2) * Math.sin(a) - (th / 2) * Math.cos(a);
  page.drawText(text, { x, y, size, font, rotate: degrees(45), color: rgb(0, 0, 0), opacity: wm.opacity, blendMode: BlendMode.Multiply });
}

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

  // School logo above the title.
  const logo = input.branding?.logo ? await embedLogo(out, input.branding.logo) : null;
  const logoSize = logo ? logo.scaleToFit(contentW * 0.4, LOGO_MAX_H) : null;
  const logoBlock = logoSize ? logoSize.height + LOGO_GAP : 0;
  const headerHeight = logoBlock + allHeader.reduce((h, l) => h + l.size + l.gapAfter, 0) + 16;

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
  if (logo && logoSize) {
    pages[0].drawImage(logo, {
      x: (A4.w - logoSize.width) / 2,
      y: topDownToPdfLibY(y, logoSize.height, H),
      width: logoSize.width,
      height: logoSize.height,
    });
    y += logoBlock;
  }
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

  // ---- Watermark (last, on top) ------------------------------------------------------------
  const wm = input.branding?.watermark;
  if (wm) {
    let wmLogo: PDFImage | null = null;
    if (wm.logo?.type === "image/png") {
      wmLogo = await (async () => {
        try {
          return await out.embedPng(fadePngToWhite(wm.logo!.bytes, wm.opacity));
        } catch {
          return null;
        }
      })();
    } else if (wm.logo) {
      wmLogo = await embedLogo(out, wm.logo);
    }
    for (const p of pages) drawWatermark(p, wm, sansBold, wmLogo);
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
