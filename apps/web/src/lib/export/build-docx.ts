import type { PaperHeader } from "@/db/schema";
import { itemMarks, itemRegions, totalMarks, type Bank, type Item } from "@/lib/builder/model";
import { processorFetch } from "@/lib/processor";

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
    total_marks: totalMarks(items, bank),
    items: items.map((it, i) => ({
      number: i + 1, // serial = position + 1, never stored
      marks: itemMarks(it, bank),
      paper_id: bank[it.questionId].paperId,
      regions: itemRegions(it, bank).map(({ page, x0, y0, x1, y1 }) => ({ page, x0, y0, x1, y1 })),
    })),
  };
  const form = new FormData();
  form.append("spec", JSON.stringify(spec));
  for (const paperId of new Set(spec.items.map((i) => i.paper_id))) {
    const bytes = await input.loadSource(paperId);
    form.append(`pdf_${paperId}`, new Blob([bytes as BlobPart], { type: "application/pdf" }), `${paperId}.pdf`);
  }
  const res = await processorFetch("/export/docx", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Word export failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}
