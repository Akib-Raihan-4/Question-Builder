import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteObject, paperFileKey, putPdf } from "@/lib/storage";
import { enqueueSegmentPaper } from "@/lib/jobs/queue";
import { SERIES, type Series } from "@/lib/paper-filename";

export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export type NewPaperInput = {
  subjectId: string;
  paperCode: string;
  series: Series;
  year: number;
  tier: "F" | "H" | null;
  bytes: Uint8Array;
  filename: string;
  uploadedBy: string;
  /** false = no automatic detection; the admin marks questions by hand. */
  autoDetect?: boolean;
};

/** Any board's code: "4MB1/01", "4MA1/1H", "WPH13/01", "9PH0/03"... letters, digits, / and -. */
export const PAPER_CODE_RE = /^[0-9A-Z][0-9A-Z/ -]{1,23}$/;

export type CreateResult =
  | { ok: true; paperId: string; status: "processing" }
  | { ok: false; error: string; code: "invalid" | "duplicate" | "storage" | "queue" };

const isPdf = (b: Uint8Array) => b.length > 4 && String.fromCharCode(...b.slice(0, 4)) === "%PDF";

/** Validate → papers row → storage → queue. Shared by single and ZIP upload. */
export async function createPaper(input: NewPaperInput): Promise<CreateResult> {
  const paperCode = input.paperCode.trim().toUpperCase();
  if (!isPdf(input.bytes)) return { ok: false, code: "invalid", error: "Not a PDF file" };
  if (input.bytes.length > MAX_PDF_BYTES) return { ok: false, code: "invalid", error: "PDF is larger than 50 MB" };
  if (!SERIES.includes(input.series)) return { ok: false, code: "invalid", error: "Unknown series" };
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    return { ok: false, code: "invalid", error: "Year looks wrong" };
  }
  if (!PAPER_CODE_RE.test(paperCode)) {
    return { ok: false, code: "invalid", error: 'Paper code should be letters and numbers, e.g. "4MB1/01" or "WPH13/01"' };
  }

  const [subject] = await db.select().from(schema.subjects).where(eq(schema.subjects.id, input.subjectId));
  if (!subject) return { ok: false, code: "invalid", error: "Unknown subject" };

  const id = crypto.randomUUID();
  const fileKey = paperFileKey(id);
  try {
    await db.insert(schema.papers).values({
      id,
      subjectId: subject.id,
      paperCode,
      series: input.series,
      year: input.year,
      tier: input.tier,
      fileKey,
      originalFilename: input.filename,
      fileSize: input.bytes.length,
      // The board picks the parser, unless the admin chose to mark questions by hand.
      parserKey: input.autoDetect === false ? "manual" : subject.board,
      status: "uploaded",
      uploadedBy: input.uploadedBy,
    });
  } catch (err) {
    if ((err as { cause?: { code?: string } }).cause?.code === "23505" || (err as { code?: string }).code === "23505") {
      return { ok: false, code: "duplicate", error: `${paperCode} ${input.series} ${input.year} is already uploaded` };
    }
    throw err;
  }

  try {
    await putPdf(fileKey, input.bytes);
  } catch (err) {
    await db.delete(schema.papers).where(eq(schema.papers.id, id));
    return { ok: false, code: "storage", error: `Storage upload failed: ${(err as Error).message}` };
  }

  try {
    await enqueueSegmentPaper(id);
    await db.update(schema.papers).set({ status: "processing", updatedAt: new Date() }).where(eq(schema.papers.id, id));
  } catch (err) {
    await db
      .update(schema.papers)
      .set({ statusReason: `Could not queue processing: ${(err as Error).message}` })
      .where(eq(schema.papers.id, id));
    return { ok: false, code: "queue", error: "Saved, but could not queue processing. Use Re-run." };
  }
  return { ok: true, paperId: id, status: "processing" };
}

export async function deletePaper(id: string) {
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, id));
  if (!paper) return false;
  await db.delete(schema.papers).where(eq(schema.papers.id, id));
  await deleteObject(paper.fileKey).catch((e) => console.error("[storage] delete failed", e));
  return true;
}
