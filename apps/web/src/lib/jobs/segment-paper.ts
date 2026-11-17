import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getObjectBytes } from "@/lib/storage";

/** JSON contract returned by services/processor (POST /segment/qp). Coordinates: PDF pt, top-left. */
type PRegion = { page: number; x0: number; y0: number; x1: number; y1: number };
type PPart = { label: string; marks: number; text: string; regions: PRegion[] };
type PQuestion = {
  number: number;
  total_marks: number;
  confidence: number;
  text: string;
  warnings: string[];
  regions: PRegion[];
  parts: PPart[];
};
export type SegmentResult = {
  parser_key: string;
  parser_version: string;
  status: "ok" | "failed";
  reason: string | null;
  page_count: number;
  page_width: number;
  page_height: number;
  questions: PQuestion[];
  warnings: string[];
};

const processorUrl = () => process.env.PROCESSOR_URL ?? "http://localhost:8000";

export async function callProcessor(parserKey: string, pdf: Uint8Array): Promise<SegmentResult> {
  const form = new FormData();
  form.append("parser_key", parserKey);
  form.append("file", new Blob([pdf as BlobPart], { type: "application/pdf" }), "paper.pdf");
  const res = await fetch(`${processorUrl()}/segment/qp`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Processor responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function setPaperStatus(
  paperId: string,
  status: (typeof schema.paperStatus.enumValues)[number],
  statusReason: string | null = null,
) {
  await db
    .update(schema.papers)
    .set({ status, statusReason, updatedAt: new Date() })
    .where(eq(schema.papers.id, paperId));
}

/**
 * Replace a paper's auto-segmented questions with a fresh processor result.
 * (Phase 4 will keep regions with edited_by_admin = true across re-runs.)
 */
export async function saveSegmentResult(paperId: string, r: SegmentResult) {
  await db.transaction(async (tx) => {
    const old = await tx
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.paperId, paperId));
    const oldQ = old.map((q) => q.id);
    if (oldQ.length) {
      const oldParts = await tx
        .select({ id: schema.questionParts.id })
        .from(schema.questionParts)
        .where(inArray(schema.questionParts.questionId, oldQ));
      const owners = [...oldQ, ...oldParts.map((p) => p.id)];
      await tx.delete(schema.regions).where(inArray(schema.regions.ownerId, owners));
      await tx.delete(schema.questions).where(eq(schema.questions.paperId, paperId)); // cascades parts
    }

    for (const q of r.questions) {
      const [qRow] = await tx
        .insert(schema.questions)
        .values({
          paperId,
          number: q.number,
          totalMarks: q.total_marks,
          confidence: q.confidence,
          warnings: q.warnings,
          text: q.text,
        })
        .returning({ id: schema.questions.id });
      const regionRows: (typeof schema.regions.$inferInsert)[] = q.regions.map((rg, i) => ({
        ownerType: "question" as const, ownerId: qRow.id, sortOrder: i, ...rg,
      }));
      for (const [pi, p] of q.parts.entries()) {
        const [pRow] = await tx
          .insert(schema.questionParts)
          .values({ questionId: qRow.id, label: p.label, sortOrder: pi, marks: p.marks, text: p.text })
          .returning({ id: schema.questionParts.id });
        regionRows.push(
          ...p.regions.map((rg, i) => ({ ownerType: "part" as const, ownerId: pRow.id, sortOrder: i, ...rg })),
        );
      }
      if (regionRows.length) await tx.insert(schema.regions).values(regionRows);
    }

    const failed = r.status === "failed";
    const reason = failed
      ? r.reason
      : r.questions.length === 0
        ? "Parser found no questions (segmentation rules arrive in Phase 3)."
        : null;
    await tx
      .update(schema.papers)
      .set({
        pageCount: r.page_count,
        pageWidth: r.page_width,
        pageHeight: r.page_height,
        parserVersion: r.parser_version,
        status: failed ? "failed" : "needs_review",
        statusReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(schema.papers.id, paperId));
  });
}

/** The job body: fetch the PDF from storage, send it to the processor, store the JSON. */
export async function runSegmentPaper(paperId: string) {
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, paperId));
  if (!paper) return { skipped: "paper deleted" };
  await setPaperStatus(paperId, "processing");
  const pdf = await getObjectBytes(paper.fileKey);
  const result = await callProcessor(paper.parserKey, pdf);
  await saveSegmentResult(paperId, result);
  return { questions: result.questions.length, status: result.status };
}
