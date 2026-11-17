import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";

const Body = z.object({
  number: z.number().int().min(1).max(200).optional(),
  totalMarks: z.number().int().min(0).max(200),
});

/** Add a question by hand (then draw its box). Used when automatic detection misses or isn't used. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const paperId = (await params).id;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the question's marks" }, { status: 400 });
  const [paper] = await db.select({ id: schema.papers.id, status: schema.papers.status }).from(schema.papers).where(eq(schema.papers.id, paperId));
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${schema.questions.number}), 0)::int + 1` })
    .from(schema.questions)
    .where(eq(schema.questions.paperId, paperId));
  const number = parsed.data.number ?? next;
  const [clash] = await db
    .select({ id: schema.questions.id })
    .from(schema.questions)
    .where(and(eq(schema.questions.paperId, paperId), eq(schema.questions.number, number)));
  if (clash) return NextResponse.json({ error: `Question ${number} already exists` }, { status: 409 });

  const [row] = await db
    .insert(schema.questions)
    .values({ paperId, number, totalMarks: parsed.data.totalMarks, editedByAdmin: true, warnings: [] })
    .returning();
  await db
    .update(schema.papers)
    .set({
      structureEdited: true,
      updatedAt: new Date(),
      // A failed (e.g. scanned) paper becomes reviewable once questions are marked by hand.
      ...(paper.status === "failed" ? { status: "needs_review" as const, statusReason: "Questions marked by hand." } : {}),
    })
    .where(eq(schema.papers.id, paperId));
  return NextResponse.json(row, { status: 201 });
}
