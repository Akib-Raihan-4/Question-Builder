import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { scheduleReadMarkScheme } from "@/lib/mark-schemes/server";

export const maxDuration = 120;

/** Read the mark scheme again (rows edited by hand are kept). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  const rows = await db
    .update(schema.markSchemes)
    .set({ status: "processing", statusReason: null, updatedAt: new Date() })
    .where(eq(schema.markSchemes.paperId, id))
    .returning({ id: schema.markSchemes.id });
  if (!rows.length) return NextResponse.json({ error: "No mark scheme" }, { status: 404 });
  scheduleReadMarkScheme(id);
  return NextResponse.json({ ok: true });
}
