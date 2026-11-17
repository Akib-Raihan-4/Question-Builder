import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** The paper a question / part / region belongs to (for touching updatedAt, flags). */
export async function paperOfQuestion(questionId: string) {
  const [q] = await db
    .select({ paperId: schema.questions.paperId })
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId));
  return q?.paperId ?? null;
}

export async function questionOfPart(partId: string) {
  const [p] = await db
    .select({ questionId: schema.questionParts.questionId })
    .from(schema.questionParts)
    .where(eq(schema.questionParts.id, partId));
  return p?.questionId ?? null;
}

export async function touchPaper(paperId: string, opts: { structure?: boolean } = {}) {
  await db
    .update(schema.papers)
    .set({ updatedAt: new Date(), ...(opts.structure ? { structureEdited: true } : {}) })
    .where(eq(schema.papers.id, paperId));
}
