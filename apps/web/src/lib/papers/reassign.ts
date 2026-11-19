import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { planMoves } from "./match";

/**
 * After a subject is added or its spec code changes: papers whose code a MORE specific subject
 * now covers move to it (e.g. adding "4MB1/02" takes Paper 2 and 2R out of "4MB1"). Papers an
 * admin filed under a subject that doesn't cover their code are left where they are.
 */
export async function reassignPapers(): Promise<number> {
  const subjects = await db.select({ id: schema.subjects.id, specCode: schema.subjects.specCode }).from(schema.subjects);
  const papers = await db.select({ id: schema.papers.id, code: schema.papers.paperCode, subjectId: schema.papers.subjectId }).from(schema.papers);
  let moved = 0;
  for (const m of planMoves(subjects, papers)) {
    await db.update(schema.papers).set({ subjectId: m.to, updatedAt: new Date() }).where(eq(schema.papers.id, m.paperId));
    moved++;
  }
  return moved;
}
