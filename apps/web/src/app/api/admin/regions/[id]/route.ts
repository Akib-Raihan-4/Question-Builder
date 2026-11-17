import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";

const Patch = z.object({ page: z.number().int().min(0).optional(), x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() });

/** Admin moved or resized a box. The edited flag makes parser re-runs keep it. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid box" }, { status: 400 });
  const b = parsed.data;
  if (Math.abs(b.x1 - b.x0) < 4 || Math.abs(b.y1 - b.y0) < 4) {
    return NextResponse.json({ error: "Box is too small" }, { status: 400 });
  }
  const [row] = await db
    .update(schema.regions)
    .set({
      ...(b.page !== undefined ? { page: b.page } : {}),
      x0: Math.min(b.x0, b.x1), x1: Math.max(b.x0, b.x1), y0: Math.min(b.y0, b.y1), y1: Math.max(b.y0, b.y1),
      editedByAdmin: true,
    })
    .where(eq(schema.regions.id, (await params).id))
    .returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  const [r] = await db.select().from(schema.regions).where(eq(schema.regions.id, id));
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(schema.regions).where(eq(schema.regions.id, id));
  // Mark a sibling as admin-edited so a re-run doesn't bring the deleted box back.
  const [sibling] = await db.select().from(schema.regions).where(eq(schema.regions.ownerId, r.ownerId)).limit(1);
  if (sibling) await db.update(schema.regions).set({ editedByAdmin: true }).where(eq(schema.regions.id, sibling.id));
  return NextResponse.json({ ok: true });
}
