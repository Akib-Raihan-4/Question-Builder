import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OwnBox } from "@/db/schema";

export type BoxDoc = "paper" | "ms";
export type OwnerType = "question" | "part";

/** A teacher's own boxes on one document, by question/part id. */
export async function ownBoxes(userId: string | undefined, doc: BoxDoc, ownerIds: string[]): Promise<Map<string, OwnBox[]>> {
  if (!userId || !ownerIds.length) return new Map();
  const rows = await db
    .select({ ownerId: schema.userBoxes.ownerId, boxes: schema.userBoxes.boxes })
    .from(schema.userBoxes)
    .where(and(eq(schema.userBoxes.userId, userId), eq(schema.userBoxes.doc, doc), inArray(schema.userBoxes.ownerId, ownerIds)));
  return new Map(rows.map((r) => [r.ownerId, sortBoxes(r.boxes)]));
}

/** Top to bottom, page by page — the order they print in. */
export const sortBoxes = (boxes: OwnBox[]) => [...boxes].sort((a, b) => a.page - b.page || a.y0 - b.y0);

/**
 * Whether a teacher may set their own boxes for this question or part: its paper must be
 * published (and, for mark scheme boxes, its mark scheme too). Admins may always.
 * Returns the paper id, or null.
 */
export async function ownBoxesAllowed(doc: BoxDoc, ownerType: OwnerType, ownerId: string, isAdmin: boolean): Promise<string | null> {
  let questionId = ownerId;
  if (ownerType === "part") {
    const [p] = await db.select({ q: schema.questionParts.questionId }).from(schema.questionParts).where(eq(schema.questionParts.id, ownerId));
    if (!p) return null;
    questionId = p.q;
  }
  const [row] = await db
    .select({ paperId: schema.papers.id, status: schema.papers.status, msStatus: schema.markSchemes.status })
    .from(schema.questions)
    .innerJoin(schema.papers, eq(schema.papers.id, schema.questions.paperId))
    .leftJoin(schema.markSchemes, eq(schema.markSchemes.paperId, schema.papers.id))
    .where(eq(schema.questions.id, questionId));
  if (!row) return null;
  if (doc === "ms" && !row.msStatus) return null;
  if (isAdmin) return row.paperId;
  if (row.status !== "published" || (doc === "ms" && row.msStatus !== "published")) return null;
  return row.paperId;
}
