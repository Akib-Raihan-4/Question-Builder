import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";

/**
 * Reject a pending sign-up, or remove an account. Deletes the user; their sessions, login and
 * built papers go with it (ON DELETE CASCADE).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  if (id === u.userId) return NextResponse.json({ error: "You can't remove your own account" }, { status: 400 });
  const [target] = await db.select({ role: schema.user.role, status: schema.user.status }).from(schema.user).where(eq(schema.user.id, id));
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Papers an admin uploaded keep existing; just drop the link to the deleted admin.
  await db.update(schema.papers).set({ uploadedBy: null }).where(eq(schema.papers.uploadedBy, id));
  await db.delete(schema.user).where(eq(schema.user.id, id));
  return NextResponse.json({ ok: true });
}
