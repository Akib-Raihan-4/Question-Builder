import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { processorFetch } from "@/lib/processor";
import { saveLayout } from "@/lib/papers/layout";
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

export async function callProcessor(parserKey: string, pdf: Uint8Array): Promise<SegmentResult> {
  const form = new FormData();
  form.append("parser_key", parserKey);
  form.append("file", new Blob([pdf as BlobPart], { type: "application/pdf" }), "paper.pdf");
  const res = await processorFetch("/segment/qp", { method: "POST", body: form });
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Replace an owner's regions with fresh parser output — unless an admin has edited any of
 * them, in which case the admin's boxes win and the parser's are ignored.
 */
async function syncRegions(tx: Tx, ownerType: "question" | "part", ownerId: string, fresh: PRegion[]) {
  const current = await tx
    .select({ id: schema.regions.id, edited: schema.regions.editedByAdmin })
    .from(schema.regions)
    .where(and(eq(schema.regions.ownerType, ownerType), eq(schema.regions.ownerId, ownerId)));
  if (current.some((r) => r.edited)) return "kept";
  if (current.length) {
    await tx.delete(schema.regions).where(inArray(schema.regions.id, current.map((r) => r.id)));
  }
  if (fresh.length) {
    await tx.insert(schema.regions).values(fresh.map((rg, i) => ({ ownerType, ownerId, sortOrder: i, ...rg })));
  }
  return "replaced";
}

/**
 * Merge a processor result into the paper's question bank.
 *
 * Re-runs must never undo admin work, and question/part ids must stay stable because
 * teachers' built papers point at them. So rows are matched (questions by number, parts by
 * label) and updated in place:
 *   - regions with edited_by_admin: the owner's boxes are kept as they are
 *   - questions/parts with edited_by_admin: their marks/labels are kept
 *   - rows the parser no longer finds are removed only if untouched and unused
 */
export async function saveSegmentResult(paperId: string, r: SegmentResult) {
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(schema.questions).where(eq(schema.questions.paperId, paperId));
    const byNumber = new Map(existing.map((q) => [q.number, q]));
    const seen = new Set<string>();

    for (const q of r.questions) {
      const ex = byNumber.get(q.number);
      let questionId: string;
      if (!ex) {
        const [row] = await tx
          .insert(schema.questions)
          .values({
            paperId, number: q.number, totalMarks: q.total_marks, confidence: q.confidence,
            warnings: q.warnings, text: q.text,
          })
          .returning({ id: schema.questions.id });
        questionId = row.id;
      } else {
        questionId = ex.id;
        await tx
          .update(schema.questions)
          .set({
            confidence: q.confidence,
            warnings: q.warnings,
            text: q.text,
            ...(ex.editedByAdmin ? {} : { totalMarks: q.total_marks }),
          })
          .where(eq(schema.questions.id, ex.id));
      }
      seen.add(questionId);
      await syncRegions(tx, "question", questionId, q.regions);

      const exParts = ex
        ? await tx.select().from(schema.questionParts).where(eq(schema.questionParts.questionId, questionId))
        : [];
      const partsByLabel = new Map(exParts.map((p) => [p.label, p]));
      const seenParts = new Set<string>();
      for (const [pi, p] of q.parts.entries()) {
        const exP = partsByLabel.get(p.label);
        let partId: string;
        if (!exP) {
          const [row] = await tx
            .insert(schema.questionParts)
            .values({ questionId, label: p.label, sortOrder: pi, marks: p.marks, text: p.text })
            .returning({ id: schema.questionParts.id });
          partId = row.id;
        } else {
          partId = exP.id;
          await tx
            .update(schema.questionParts)
            .set({ text: p.text, sortOrder: pi, ...(exP.editedByAdmin ? {} : { marks: p.marks }) })
            .where(eq(schema.questionParts.id, exP.id));
        }
        seenParts.add(partId);
        await syncRegions(tx, "part", partId, p.regions);
      }
      for (const old of exParts) {
        if (seenParts.has(old.id) || old.editedByAdmin) continue;
        const edited = await tx
          .select({ id: schema.regions.id })
          .from(schema.regions)
          .where(and(eq(schema.regions.ownerId, old.id), eq(schema.regions.editedByAdmin, true)));
        if (edited.length) continue;
        await tx.delete(schema.regions).where(eq(schema.regions.ownerId, old.id));
        await tx.delete(schema.questionParts).where(eq(schema.questionParts.id, old.id));
      }
    }

    // Questions the parser no longer finds: drop them if nobody touched or used them.
    for (const old of existing) {
      if (seen.has(old.id) || old.editedByAdmin) continue;
      const [used] = await tx
        .select({ id: schema.builtPaperItems.id })
        .from(schema.builtPaperItems)
        .where(eq(schema.builtPaperItems.questionId, old.id))
        .limit(1);
      const partIds = (
        await tx.select({ id: schema.questionParts.id }).from(schema.questionParts)
          .where(eq(schema.questionParts.questionId, old.id))
      ).map((p) => p.id);
      const edited = await tx
        .select({ id: schema.regions.id })
        .from(schema.regions)
        .where(and(inArray(schema.regions.ownerId, [old.id, ...partIds]), eq(schema.regions.editedByAdmin, true)));
      if (used || edited.length) {
        await tx
          .update(schema.questions)
          .set({ warnings: [...old.warnings, "The parser no longer finds this question; kept because it was edited or used"] })
          .where(eq(schema.questions.id, old.id));
        continue;
      }
      await tx.delete(schema.regions).where(inArray(schema.regions.ownerId, [old.id, ...partIds]));
      await tx.delete(schema.questions).where(eq(schema.questions.id, old.id));
    }

    const failed = r.status === "failed";
    const reason = failed
      ? r.reason
      : r.parser_key === "manual"
        ? "Questions are marked by hand: add each question, then draw its box."
        : r.questions.length === 0
          ? "No questions were found automatically — add them by hand."
          : r.warnings.join(" ") || null;
    await tx
      .update(schema.papers)
      .set({
        pageCount: r.page_count,
        pageWidth: r.page_width,
        pageHeight: r.page_height,
        parserVersion: r.parser_version,
        status: failed ? "failed" : "needs_review",
        statusReason: reason,
        publishedAt: null,
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
  await saveLayout(paperId, pdf);
  return { questions: result.questions.length, status: result.status };
}
