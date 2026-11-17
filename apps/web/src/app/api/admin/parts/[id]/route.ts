import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { paperOfQuestion, questionOfPart, touchPaper } from "@/lib/review/ownership";

const Patch = z.object({
  label: z.string().trim().min(1).max(12).optional(),
  marks: z.number().int().min(0).max(100).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { label, marks } = parsed.data;
  const [row] = await db
    .update(schema.questionParts)
    .set({ ...(label ? { label: label.replace(/[()]/g, "") } : {}), ...(marks !== undefined ? { marks } : {}), editedByAdmin: true })
    .where(eq(schema.questionParts.id, id))
    .returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  const questionId = await questionOfPart(id);
  const paperId = questionId && (await paperOfQuestion(questionId));
  if (!paperId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(schema.regions).where(eq(schema.regions.ownerId, id));
  await db.delete(schema.questionParts).where(eq(schema.questionParts.id, id));
  await touchPaper(paperId, { structure: true });
  return NextResponse.json({ ok: true });
}
