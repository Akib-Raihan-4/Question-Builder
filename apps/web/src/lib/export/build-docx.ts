import type { PaperHeader } from "@/db/schema";
import { itemBlocks, itemMarks, totalMarks, type Bank, type Item } from "@/lib/builder/model";
import { processorFetch } from "@/lib/processor";
import type { ExportBranding } from "@/lib/watermark";

export type DocxMode = "pictures" | "editable";

/**
 * Word export runs in the processor (PyMuPDF renders/reads the original PDFs; python-docx writes
 * the file). We send the layout as JSON plus each source PDF once.
 */
export async function buildPaperDocx(input: {
  title: string;
  header: PaperHeader;
  items: Item[];
  bank: Bank;
  mode: DocxMode;
  loadSource: (paperId: string) => Promise<Uint8Array>;
  branding?: ExportBranding;
}): Promise<Uint8Array> {
  const { items, bank } = input;
  const spec = {
    title: input.title,
    header: {
      school: input.header.school,
      title: input.header.title,
      className: input.header.className,
      timeAllowed: input.header.timeAllowed,
      instructions: input.header.instructions,
    },
    mode: input.mode,
    // The images themselves are sent as files "logo" and "watermark_logo".
    watermark: input.branding?.watermark
      ? { text: input.branding.watermark.text, logo: Boolean(input.branding.watermark.logo), opacity: input.branding.watermark.opacity }
      : null,
    total_marks: totalMarks(items, bank),
    items: items.map((it, i) => ({
      number: i + 1, // serial = position + 1, never stored
      marks: itemMarks(it, bank),
      paper_id: bank[it.questionId].paperId,
      // Crops of the original plus any added answer lines / blank space (same as the PDF).
      blocks: itemBlocks(it, bank).map((b) =>
        b.kind === "crop"
          ? { kind: "crop", page: b.region.page, x0: b.region.x0, y0: b.region.y0, x1: b.region.x1, y1: b.region.y1 }
          : b.kind === "lines"
            ? { kind: "lines", count: b.count }
            : { kind: "space", h: b.h },
      ),
    })),
  };
  const form = new FormData();
  form.append("spec", JSON.stringify(spec));
  for (const paperId of new Set(spec.items.map((i) => i.paper_id))) {
    const bytes = await input.loadSource(paperId);
    form.append(`pdf_${paperId}`, new Blob([bytes as BlobPart], { type: "application/pdf" }), `${paperId}.pdf`);
  }
  const b = input.branding;
  if (b?.logo) form.append("logo", new Blob([b.logo.bytes as BlobPart], { type: b.logo.type }), "logo");
  if (b?.watermark?.logo) form.append("watermark_logo", new Blob([b.watermark.logo.bytes as BlobPart], { type: b.watermark.logo.type }), "watermark_logo");
  const res = await processorFetch("/export/docx", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Word export failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}
