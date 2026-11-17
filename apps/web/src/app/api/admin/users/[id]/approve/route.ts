import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";

/** Approve a pending sign-up: the teacher can sign in from now on. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const [row] = await db
    .update(schema.user)
    .set({ status: "active", approvedAt: new Date(), approvedBy: u.userId, updatedAt: new Date() })
    .where(and(eq(schema.user.id, (await params).id), eq(schema.user.status, "pending")))
    .returning({ id: schema.user.id });
  return row ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "No pending account found" }, { status: 404 });
}
