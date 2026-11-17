import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
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
