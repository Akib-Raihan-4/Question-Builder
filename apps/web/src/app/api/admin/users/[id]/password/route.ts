import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { auth } from "@/lib/auth";

// No 0/O, 1/l/I: easy to read out or copy by hand.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** e.g. "h7Kq-mP3x-W9cd" (about 70 bits of randomness). */
function temporaryPassword() {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}

/**
 * Give a teacher a new, temporary password (there's no email to send a reset link). Their other
 * sign-ins end. The password is returned once so the admin can pass it on; it isn't stored in
 * plain text anywhere.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  if (id === u.userId) {
    return NextResponse.json({ error: "Change your own password from Your account" }, { status: 400 });
  }
  const [target] = await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.id, id));
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers' passwords can be reset here" }, { status: 400 });
  }

  const password = temporaryPassword();
  const hash = await (await auth.$context).password.hash(password);
  const updated = await db
    .update(schema.account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(schema.account.userId, id), eq(schema.account.providerId, "credential")))
    .returning({ id: schema.account.id });
  if (!updated.length) return NextResponse.json({ error: "This account has no password sign-in" }, { status: 400 });
  await db.delete(schema.session).where(eq(schema.session.userId, id));

  return NextResponse.json({ password }, { headers: { "Cache-Control": "no-store" } });
}
