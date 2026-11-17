import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { getBuiltPaper } from "@/lib/builder/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const bp = await getBuiltPaper((await params).id, u.userId);
  return bp ? NextResponse.json(bp) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

const Body = z.object({
  title: z.string().trim().max(200),
  header: z.object({
    school: z.string().max(200).optional(),
    className: z.string().max(100).optional(),
    title: z.string().max(200).optional(),
    timeAllowed: z.string().max(100).optional(),
    instructions: z.string().max(4000).optional(),
    targetMarks: z.number().int().min(0).max(1000).optional(),
  }),
  items: z
    .array(z.object({ questionId: z.string().uuid(), partIds: z.array(z.string().uuid()).max(50) }))
    .max(200),
});

/** Auto-save: replace title, header and the ordered items. Position is the array index. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const id = (await params).id;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid paper" }, { status: 400 });
  const { title, header, items } = parsed.data;

  const [bp] = await db
    .select({ id: schema.builtPapers.id })
    .from(schema.builtPapers)
    .where(and(eq(schema.builtPapers.id, id), eq(schema.builtPapers.ownerId, u.userId)));
  if (!bp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only questions from published papers (admins may use any).
  const qIds = [...new Set(items.map((i) => i.questionId))];
  if (qIds.length !== items.length) return NextResponse.json({ error: "A question appears twice" }, { status: 400 });
  if (qIds.length) {
    const ok = await db
      .select({ id: schema.questions.id, status: schema.papers.status })
      .from(schema.questions)
      .innerJoin(schema.papers, eq(schema.papers.id, schema.questions.paperId))
      .where(inArray(schema.questions.id, qIds));
    const allowed = new Set(ok.filter((q) => q.status === "published" || u.role === "admin").map((q) => q.id));
    if (qIds.some((q) => !allowed.has(q))) return NextResponse.json({ error: "Some questions are not available" }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.builtPapers)
      .set({ title: title || "Untitled paper", headerJson: header, updatedAt: new Date() })
      .where(eq(schema.builtPapers.id, id));
    await tx.delete(schema.builtPaperItems).where(eq(schema.builtPaperItems.builtPaperId, id));
    if (items.length) {
      await tx
        .insert(schema.builtPaperItems)
        .values(items.map((it, position) => ({ builtPaperId: id, position, questionId: it.questionId, partIds: it.partIds })));
    }
  });
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const rows = await db
    .delete(schema.builtPapers)
    .where(and(eq(schema.builtPapers.id, (await params).id), eq(schema.builtPapers.ownerId, u.userId)))
    .returning({ id: schema.builtPapers.id });
  return rows.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
