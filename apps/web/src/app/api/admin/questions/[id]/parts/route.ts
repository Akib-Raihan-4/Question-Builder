import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { paperOfQuestion, touchPaper } from "@/lib/review/ownership";

const Body = z.object({ label: z.string().trim().min(1).max(12), marks: z.number().int().min(0).max(100) });

/** Add a part the parser missed; the admin then draws its box. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const questionId = (await params).id;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give a label and marks" }, { status: 400 });
  const paperId = await paperOfQuestion(questionId);
  if (!paperId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${schema.questionParts.sortOrder}) + 1, 0)::int` })
    .from(schema.questionParts)
    .where(eq(schema.questionParts.questionId, questionId));
  const [row] = await db
    .insert(schema.questionParts)
    .values({ questionId, label: parsed.data.label.replace(/[()]/g, ""), marks: parsed.data.marks, sortOrder: next, editedByAdmin: true })
    .returning();
  await touchPaper(paperId, { structure: true });
  return NextResponse.json(row, { status: 201 });
}
