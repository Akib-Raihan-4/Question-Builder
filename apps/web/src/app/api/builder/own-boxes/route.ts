import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { ownBoxesAllowed, sortBoxes } from "@/lib/builder/own-boxes";

const Target = z.object({
  doc: z.enum(["paper", "ms"]),
  ownerType: z.enum(["question", "part"]),
  ownerId: z.string().uuid(),
});
const Box = z
  .object({ page: z.number().int().min(0), x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
  .transform((b) => ({ page: b.page, x0: Math.min(b.x0, b.x1), x1: Math.max(b.x0, b.x1), y0: Math.min(b.y0, b.y1), y1: Math.max(b.y0, b.y1) }))
  .refine((b) => b.x1 - b.x0 >= 4 && b.y1 - b.y0 >= 4, "Box is too small");
const Put = Target.extend({ boxes: z.array(Box).min(1).max(20) });

const where = (userId: string, t: z.infer<typeof Target>) =>
  and(eq(schema.userBoxes.userId, userId), eq(schema.userBoxes.doc, t.doc), eq(schema.userBoxes.ownerType, t.ownerType), eq(schema.userBoxes.ownerId, t.ownerId));

/** Save the signed-in teacher's own boxes for a question or part (theirs only; shared boxes stay). */
export async function PUT(req: Request) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const parsed = Put.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid boxes" }, { status: 400 });
  const b = parsed.data;
  if (!(await ownBoxesAllowed(b.doc, b.ownerType, b.ownerId, u.role === "admin"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const boxes = sortBoxes(b.boxes);
  await db
    .insert(schema.userBoxes)
    .values({ userId: u.userId, doc: b.doc, ownerType: b.ownerType, ownerId: b.ownerId, boxes })
    .onConflictDoUpdate({
      target: [schema.userBoxes.userId, schema.userBoxes.doc, schema.userBoxes.ownerType, schema.userBoxes.ownerId],
      set: { boxes, updatedAt: new Date() },
    });
  return NextResponse.json({ ok: true });
}

/** Go back to the shared boxes. */
export async function DELETE(req: Request) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const parsed = Target.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await db.delete(schema.userBoxes).where(where(u.userId, parsed.data));
  return NextResponse.json({ ok: true });
}
