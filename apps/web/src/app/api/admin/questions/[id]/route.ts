import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { paperOfQuestion, touchPaper } from "@/lib/review/ownership";

const Patch = z.object({
  totalMarks: z.number().int().min(0).max(200).optional(),
  topicIds: z.array(z.string().uuid()).max(10).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const paperId = await paperOfQuestion(id);
  if (!paperId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { totalMarks, topicIds } = parsed.data;

  if (totalMarks !== undefined) {
    await db.update(schema.questions).set({ totalMarks, editedByAdmin: true }).where(eq(schema.questions.id, id));
  }
  if (topicIds) {
    await db.transaction(async (tx) => {
      await tx.delete(schema.questionTopics).where(eq(schema.questionTopics.questionId, id));
      if (topicIds.length) {
        await tx
          .insert(schema.questionTopics)
          .values(topicIds.map((topicId) => ({ questionId: id, topicId, source: "admin" as const })));
      }
    });
  }
  await touchPaper(paperId);
  return NextResponse.json({ ok: true });
}

/** Remove a question (and its parts and boxes) — unless a teacher's paper uses it. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  const paperId = await paperOfQuestion(id);
  if (!paperId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [used] = await db
    .select({ id: schema.builtPaperItems.id })
    .from(schema.builtPaperItems)
    .where(eq(schema.builtPaperItems.questionId, id))
    .limit(1);
  if (used) return NextResponse.json({ error: "A teacher's paper uses this question, so it can't be deleted." }, { status: 409 });
  const parts = await db.select({ id: schema.questionParts.id }).from(schema.questionParts).where(eq(schema.questionParts.questionId, id));
  await db.transaction(async (tx) => {
    await tx.delete(schema.regions).where(inArray(schema.regions.ownerId, [id, ...parts.map((p) => p.id)]));
    await tx.delete(schema.questions).where(eq(schema.questions.id, id));
  });
  await touchPaper(paperId, { structure: true });
  return NextResponse.json({ ok: true });
}
