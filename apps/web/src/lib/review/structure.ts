import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

type Result = { ok: true } | { ok: false; status: number; error: string };

/** Fold the next question into this one (when the parser split one question in two). */
export async function mergeWithNext(questionId: string): Promise<Result> {
  return db.transaction(async (tx) => {
    const [q] = await tx.select().from(schema.questions).where(eq(schema.questions.id, questionId));
    if (!q) return { ok: false, status: 404, error: "Not found" };
    const [next] = await tx
      .select()
      .from(schema.questions)
      .where(and(eq(schema.questions.paperId, q.paperId), gt(schema.questions.number, q.number)))
      .orderBy(asc(schema.questions.number))
      .limit(1);
    if (!next) return { ok: false, status: 400, error: "There is no next question to merge" };
    const [used] = await tx
      .select({ id: schema.builtPaperItems.id })
      .from(schema.builtPaperItems)
      .where(eq(schema.builtPaperItems.questionId, next.id))
      .limit(1);
    if (used) return { ok: false, status: 409, error: `Question ${next.number} is used in a teacher's paper` };

    const [{ maxPart }] = await tx
      .select({ maxPart: sql<number>`coalesce(max(${schema.questionParts.sortOrder}), -1)::int` })
      .from(schema.questionParts)
      .where(eq(schema.questionParts.questionId, q.id));
    await tx
      .update(schema.questionParts)
      .set({ questionId: q.id, sortOrder: sql`${schema.questionParts.sortOrder} + ${maxPart + 1}` })
      .where(eq(schema.questionParts.questionId, next.id));

    const [{ maxReg }] = await tx
      .select({ maxReg: sql<number>`coalesce(max(${schema.regions.sortOrder}), -1)::int` })
      .from(schema.regions)
      .where(and(eq(schema.regions.ownerType, "question"), eq(schema.regions.ownerId, q.id)));
    await tx
      .update(schema.regions)
      .set({ ownerId: q.id, sortOrder: sql`${schema.regions.sortOrder} + ${maxReg + 1}`, editedByAdmin: true })
      .where(and(eq(schema.regions.ownerType, "question"), eq(schema.regions.ownerId, next.id)));
    await tx
      .update(schema.regions)
      .set({ editedByAdmin: true })
      .where(and(eq(schema.regions.ownerType, "question"), eq(schema.regions.ownerId, q.id)));

    const nextTopics = await tx.select().from(schema.questionTopics).where(eq(schema.questionTopics.questionId, next.id));
    if (nextTopics.length) {
      await tx
        .insert(schema.questionTopics)
        .values(nextTopics.map((t) => ({ ...t, questionId: q.id })))
        .onConflictDoNothing();
    }
    await tx
      .update(schema.questions)
      .set({ totalMarks: q.totalMarks + next.totalMarks, editedByAdmin: true, text: `${q.text} ${next.text}`.trim() })
      .where(eq(schema.questions.id, q.id));
    await tx.delete(schema.questions).where(eq(schema.questions.id, next.id));
    await tx
      .update(schema.questions)
      .set({ number: sql`${schema.questions.number} - 1` })
      .where(and(eq(schema.questions.paperId, q.paperId), gt(schema.questions.number, next.number)));
    await tx.update(schema.papers).set({ structureEdited: true, updatedAt: new Date() }).where(eq(schema.papers.id, q.paperId));
    return { ok: true } as const;
  });
}

/** Start a new question at `partId` (when the parser joined two questions). */
export async function splitAtPart(questionId: string, partId: string): Promise<Result> {
  return db.transaction(async (tx) => {
    const [q] = await tx.select().from(schema.questions).where(eq(schema.questions.id, questionId));
    if (!q) return { ok: false, status: 404, error: "Not found" };
    const parts = await tx
      .select()
      .from(schema.questionParts)
      .where(eq(schema.questionParts.questionId, q.id))
      .orderBy(asc(schema.questionParts.sortOrder));
    const at = parts.findIndex((p) => p.id === partId);
    if (at <= 0) return { ok: false, status: 400, error: "Pick a part after the first one to split at" };
    const moving = parts.slice(at);

    // Where the new question starts: the top of the first moved part's first box.
    const [splitBox] = await tx
      .select()
      .from(schema.regions)
      .where(and(eq(schema.regions.ownerType, "part"), eq(schema.regions.ownerId, moving[0].id)))
      .orderBy(asc(schema.regions.page), asc(schema.regions.y0))
      .limit(1);
    if (!splitBox) return { ok: false, status: 400, error: "Draw a box for that part first" };

    await tx
      .update(schema.questions)
      .set({ number: sql`${schema.questions.number} + 1` })
      .where(and(eq(schema.questions.paperId, q.paperId), gt(schema.questions.number, q.number)));
    const movedMarks = moving.reduce((s, p) => s + p.marks, 0);
    const [created] = await tx
      .insert(schema.questions)
      .values({ paperId: q.paperId, number: q.number + 1, totalMarks: movedMarks, editedByAdmin: true, warnings: [] })
      .returning();
    await tx
      .update(schema.questionParts)
      .set({ questionId: created.id })
      .where(inArray(schema.questionParts.id, moving.map((p) => p.id)));
    await tx
      .update(schema.questions)
      .set({ totalMarks: Math.max(0, q.totalMarks - movedMarks), editedByAdmin: true })
      .where(eq(schema.questions.id, q.id));

    // Cut the old question's boxes at the split line; the part below becomes the new question's.
    const boxes = await tx
      .select()
      .from(schema.regions)
      .where(and(eq(schema.regions.ownerType, "question"), eq(schema.regions.ownerId, q.id)));
    let order = 0;
    for (const b of boxes) {
      const before = b.page < splitBox.page || (b.page === splitBox.page && b.y1 <= splitBox.y0);
      const after = b.page > splitBox.page || (b.page === splitBox.page && b.y0 >= splitBox.y0);
      if (before) {
        await tx.update(schema.regions).set({ editedByAdmin: true }).where(eq(schema.regions.id, b.id));
      } else if (after) {
        await tx
          .update(schema.regions)
          .set({ ownerId: created.id, sortOrder: order++, editedByAdmin: true })
          .where(eq(schema.regions.id, b.id));
      } else {
        await tx.update(schema.regions).set({ y1: splitBox.y0, editedByAdmin: true }).where(eq(schema.regions.id, b.id));
        await tx.insert(schema.regions).values({
          ownerType: "question", ownerId: created.id, page: b.page,
          x0: b.x0, x1: b.x1, y0: splitBox.y0, y1: b.y1, sortOrder: order++, editedByAdmin: true,
        });
      }
    }
    const topics = await tx.select().from(schema.questionTopics).where(eq(schema.questionTopics.questionId, q.id));
    if (topics.length) {
      await tx.insert(schema.questionTopics).values(topics.map((t) => ({ ...t, questionId: created.id }))).onConflictDoNothing();
    }
    await tx.update(schema.papers).set({ structureEdited: true, updatedAt: new Date() }).where(eq(schema.papers.id, q.paperId));
    return { ok: true } as const;
  });
}
