import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { paperOfQuestion, questionOfPart, touchPaper } from "@/lib/review/ownership";

const Body = z.object({
  ownerType: z.enum(["question", "part"]),
  ownerId: z.string().uuid(),
  page: z.number().int().min(0),
  x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number(),
});

/** Admin draws a new box. */
export async function POST(req: Request) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid box" }, { status: 400 });
  const b = parsed.data;
  const questionId = b.ownerType === "question" ? b.ownerId : await questionOfPart(b.ownerId);
  const paperId = questionId && (await paperOfQuestion(questionId));
  if (!paperId) return NextResponse.json({ error: "Owner not found" }, { status: 404 });

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${schema.regions.sortOrder}) + 1, 0)::int` })
    .from(schema.regions)
    .where(and(eq(schema.regions.ownerType, b.ownerType), eq(schema.regions.ownerId, b.ownerId)));
  const [row] = await db
    .insert(schema.regions)
    .values({
      ...b,
      x0: Math.min(b.x0, b.x1), x1: Math.max(b.x0, b.x1), y0: Math.min(b.y0, b.y1), y1: Math.max(b.y0, b.y1),
      sortOrder: next, editedByAdmin: true,
    })
    .returning();
  await touchPaper(paperId);
  return NextResponse.json(row, { status: 201 });
}
