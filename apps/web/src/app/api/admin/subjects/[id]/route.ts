import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { SPEC_CODE_RE } from "@/lib/papers/match";
import { reassignPapers } from "@/lib/papers/reassign";

const Body = z.object({
  qualification: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(80),
  specCode: z.string().trim().toUpperCase().regex(SPEC_CODE_RE, "Spec code: e.g. WPH13, or 4MB1/02 for one paper of a subject"),
});

/** Rename a subject (name, level, spec code). Its papers stay with it. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid subject" }, { status: 400 });
  const [clash] = await db
    .select({ id: schema.subjects.id })
    .from(schema.subjects)
    .where(and(eq(schema.subjects.specCode, parsed.data.specCode), ne(schema.subjects.id, id)));
  if (clash) return NextResponse.json({ error: `Another subject already uses ${parsed.data.specCode}` }, { status: 409 });
  const [row] = await db.update(schema.subjects).set(parsed.data).where(eq(schema.subjects.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...row, moved: await reassignPapers() });
}
