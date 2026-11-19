import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { coverageSummary } from "@/lib/mark-schemes/link";
import { markSchemeCoverage } from "@/lib/mark-schemes/server";

/** Publish (teachers can export it) or unpublish. Publishing needs every part linked to a row. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  const { publish } = (await req.json().catch(() => ({}))) as { publish?: boolean };
  const [ms] = await db.select().from(schema.markSchemes).where(eq(schema.markSchemes.paperId, id));
  if (!ms) return NextResponse.json({ error: "No mark scheme" }, { status: 404 });
  if (publish === false) {
    await db.update(schema.markSchemes).set({ status: "needs_review", publishedAt: null, updatedAt: new Date() }).where(eq(schema.markSchemes.id, ms.id));
    return NextResponse.json({ ok: true, status: "needs_review" });
  }
  const summary = coverageSummary(await markSchemeCoverage(id, ms.id));
  if (summary) return NextResponse.json({ error: summary }, { status: 422 });
  await db
    .update(schema.markSchemes)
    .set({ status: "published", statusReason: null, publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.markSchemes.id, ms.id));
  return NextResponse.json({ ok: true, status: "published" });
}
