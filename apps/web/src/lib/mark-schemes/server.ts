import { after } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { processorFetch } from "@/lib/processor";
import { deleteObject, getObjectBytes, putPdf } from "@/lib/storage";
import { coverage, coverageSummary, linkRows, type QuestionRef, type ReaderRow } from "./link";

export const msFileKey = (paperId: string) => `mark-schemes/${paperId}.pdf`;

type ReaderResult = { reader_version: string; status: "ok" | "failed"; reason: string | null; page_count: number; rows: ReaderRow[]; warnings: string[] };

async function callReader(pdf: Uint8Array): Promise<ReaderResult> {
  const form = new FormData();
  form.append("file", new Blob([pdf as BlobPart], { type: "application/pdf" }), "ms.pdf");
  const res = await processorFetch("/segment/ms", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Processor responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** The paper's questions and parts, for linking rows. */
export async function questionRefs(paperId: string): Promise<QuestionRef[]> {
  const qs = await db
    .select({ id: schema.questions.id, number: schema.questions.number })
    .from(schema.questions)
    .where(eq(schema.questions.paperId, paperId))
    .orderBy(asc(schema.questions.number));
  if (!qs.length) return [];
  const parts = await db
    .select({ id: schema.questionParts.id, questionId: schema.questionParts.questionId, label: schema.questionParts.label })
    .from(schema.questionParts)
    .where(inArray(schema.questionParts.questionId, qs.map((q) => q.id)))
    .orderBy(asc(schema.questionParts.sortOrder));
  return qs.map((q) => ({ ...q, parts: parts.filter((p) => p.questionId === q.id).map(({ id, label }) => ({ id, label })) }));
}

/** Save (or replace) a paper's mark scheme file and read it in the background. */
export async function saveMarkScheme(paperId: string, bytes: Uint8Array, filename: string | null, userId: string) {
  const key = msFileKey(paperId);
  await putPdf(key, bytes);
  const values = {
    fileKey: key,
    originalFilename: filename,
    fileSize: bytes.length,
    status: "processing" as const,
    statusReason: null,
    publishedAt: null,
    uploadedBy: userId,
    updatedAt: new Date(),
  };
  const [ms] = await db
    .insert(schema.markSchemes)
    .values({ paperId, ...values })
    .onConflictDoUpdate({ target: schema.markSchemes.paperId, set: values })
    .returning({ id: schema.markSchemes.id });
  // A new file means new rows: drop the old ones, even hand-edited ones.
  await db.delete(schema.msRegions).where(eq(schema.msRegions.markSchemeId, ms.id));
  scheduleReadMarkScheme(paperId);
  return ms.id;
}

export function scheduleReadMarkScheme(paperId: string) {
  after(async () => {
    try {
      await readMarkScheme(paperId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mark-scheme] ${paperId} failed: ${msg}`);
      await db
        .update(schema.markSchemes)
        .set({ status: "failed", statusReason: `Reading failed: ${msg}. Use Re-read to try again.`, updatedAt: new Date() })
        .where(eq(schema.markSchemes.paperId, paperId))
        .catch(() => {});
    }
  });
}

/**
 * Read the mark scheme and link its rows to the paper's parts. Rows an admin edited are kept;
 * the reader's rows with the same label are skipped.
 */
export async function readMarkScheme(paperId: string) {
  const [ms] = await db.select().from(schema.markSchemes).where(eq(schema.markSchemes.paperId, paperId));
  if (!ms) return { skipped: "no mark scheme" };
  const result = await callReader(await getObjectBytes(ms.fileKey));
  if (result.status === "failed") {
    await db
      .update(schema.markSchemes)
      .set({ status: "failed", statusReason: result.reason, pageCount: result.page_count, readerVersion: result.reader_version, updatedAt: new Date() })
      .where(eq(schema.markSchemes.id, ms.id));
    return { status: "failed" };
  }
  const refs = await questionRefs(paperId);
  const linked = linkRows(result.rows, refs);
  await db.transaction(async (tx) => {
    const kept = await tx
      .select({ label: schema.msRegions.label })
      .from(schema.msRegions)
      .where(and(eq(schema.msRegions.markSchemeId, ms.id), eq(schema.msRegions.editedByAdmin, true)));
    const keptLabels = new Set(kept.map((k) => k.label));
    await tx.delete(schema.msRegions).where(and(eq(schema.msRegions.markSchemeId, ms.id), eq(schema.msRegions.editedByAdmin, false)));
    const values = linked
      .filter((r) => !keptLabels.has(r.label))
      .flatMap((r) =>
        r.regions.map((g, i) => ({
          markSchemeId: ms.id,
          questionId: r.questionId,
          partId: r.partId,
          label: r.label,
          page: g.page,
          x0: g.x0,
          y0: g.y0,
          x1: g.x1,
          y1: g.y1,
          sortOrder: i,
        })),
      );
    if (values.length) await tx.insert(schema.msRegions).values(values);
  });
  const summary = await refreshMarkSchemeStatus(paperId, result.warnings);
  return { rows: linked.length, summary };
}

/** Recompute needs_review / issues after reading or an admin edit (published stays published only if still complete). */
export async function refreshMarkSchemeStatus(paperId: string, warnings: string[] = []) {
  const [ms] = await db.select().from(schema.markSchemes).where(eq(schema.markSchemes.paperId, paperId));
  if (!ms) return null;
  const c = await markSchemeCoverage(paperId, ms.id);
  const summary = [coverageSummary(c), warnings.length ? `Reader notes: ${warnings.slice(0, 3).join("; ")}` : null].filter(Boolean).join(" ") || null;
  const complete = !c.missing.length && !c.unlinked.length;
  await db
    .update(schema.markSchemes)
    .set({
      status: ms.status === "published" && complete ? "published" : "needs_review",
      publishedAt: ms.status === "published" && complete ? ms.publishedAt : null,
      statusReason: summary,
      updatedAt: new Date(),
    })
    .where(eq(schema.markSchemes.id, ms.id));
  return summary;
}

export async function markSchemeCoverage(paperId: string, markSchemeId: string) {
  const [refs, rows] = await Promise.all([
    questionRefs(paperId),
    db
      .select({ label: schema.msRegions.label, questionId: schema.msRegions.questionId, partId: schema.msRegions.partId })
      .from(schema.msRegions)
      .where(eq(schema.msRegions.markSchemeId, markSchemeId)),
  ]);
  return coverage(refs, rows);
}

export async function deleteMarkScheme(paperId: string) {
  const [ms] = await db.select().from(schema.markSchemes).where(eq(schema.markSchemes.paperId, paperId));
  if (!ms) return false;
  await db.delete(schema.markSchemes).where(eq(schema.markSchemes.id, ms.id));
  await deleteObject(ms.fileKey).catch((e) => console.error("[storage] delete failed", e));
  return true;
}

export type MsRowView = {
  label: string;
  questionId: string | null;
  partId: string | null;
  edited: boolean;
  regions: { id: string; page: number; x0: number; y0: number; x1: number; y1: number }[];
};

/** Everything the review screen needs about a paper's mark scheme (null = none uploaded). */
export async function loadMarkSchemeReview(paperId: string) {
  const [ms] = await db.select().from(schema.markSchemes).where(eq(schema.markSchemes.paperId, paperId));
  if (!ms) return null;
  const regions = await db
    .select()
    .from(schema.msRegions)
    .where(eq(schema.msRegions.markSchemeId, ms.id))
    .orderBy(asc(schema.msRegions.page), asc(schema.msRegions.y0));
  const rows: MsRowView[] = [];
  for (const r of regions) {
    let row = rows.find((x) => x.label === r.label);
    if (!row) rows.push((row = { label: r.label, questionId: r.questionId, partId: r.partId, edited: r.editedByAdmin, regions: [] }));
    row.regions.push({ id: r.id, page: r.page, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });
  }
  const c = await markSchemeCoverage(paperId, ms.id);
  return {
    id: ms.id,
    status: ms.status,
    statusReason: ms.statusReason,
    originalFilename: ms.originalFilename,
    pageCount: ms.pageCount,
    updatedAt: ms.updatedAt.toISOString(),
    rows,
    coverage: c,
  };
}
export type MarkSchemeReview = NonNullable<Awaited<ReturnType<typeof loadMarkSchemeReview>>>;
