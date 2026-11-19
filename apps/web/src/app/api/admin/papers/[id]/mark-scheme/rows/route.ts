import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { refreshMarkSchemeStatus } from "@/lib/mark-schemes/server";

const Link = z.object({
  label: z.string().min(1).max(40),
  questionId: z.string().uuid().nullable(),
  partId: z.string().uuid().nullable(),
});

async function scheme(paperId: string) {
  const [ms] = await db.select({ id: schema.markSchemes.id }).from(schema.markSchemes).where(eq(schema.markSchemes.paperId, paperId));
  return ms ?? null;
}

/** Link a mark scheme row (all its boxes) to a question / part. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const paperId = (await params).id;
  const parsed = Link.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid row" }, { status: 400 });
  const ms = await scheme(paperId);
  if (!ms) return NextResponse.json({ error: "No mark scheme" }, { status: 404 });
  const { label, questionId, partId } = parsed.data;
  if (questionId) {
    const [q] = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(and(eq(schema.questions.id, questionId), eq(schema.questions.paperId, paperId)));
    if (!q) return NextResponse.json({ error: "That question isn't on this paper" }, { status: 400 });
  }
  if (partId) {
    const [p] = await db
      .select({ id: schema.questionParts.id })
      .from(schema.questionParts)
      .where(and(eq(schema.questionParts.id, partId), eq(schema.questionParts.questionId, questionId ?? "")));
    if (!p) return NextResponse.json({ error: "That part isn't in the question" }, { status: 400 });
  }
  await db
    .update(schema.msRegions)
    .set({ questionId, partId, editedByAdmin: true })
    .where(and(eq(schema.msRegions.markSchemeId, ms.id), eq(schema.msRegions.label, label)));
  return NextResponse.json({ ok: true, summary: await refreshMarkSchemeStatus(paperId) });
}

/** Remove a row (e.g. something the reader picked up that isn't a mark scheme row). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const paperId = (await params).id;
  const label = new URL(req.url).searchParams.get("label");
  const ms = await scheme(paperId);
  if (!ms || !label) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(schema.msRegions).where(and(eq(schema.msRegions.markSchemeId, ms.id), eq(schema.msRegions.label, label)));
  return NextResponse.json({ ok: true, summary: await refreshMarkSchemeStatus(paperId) });
}
