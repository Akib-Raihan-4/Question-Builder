import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { publishIssues } from "@/lib/review/checks";
import { loadReview } from "@/lib/review/load";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  const { publish } = (await req.json().catch(() => ({}))) as { publish?: boolean };
  const data = await loadReview(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (publish === false) {
    await db.update(schema.papers).set({ status: "needs_review", publishedAt: null, updatedAt: new Date() }).where(eq(schema.papers.id, id));
    return NextResponse.json({ ok: true, status: "needs_review" });
  }
  // The server re-checks; the button state in the UI is only a hint.
  const issues = publishIssues(data.questions, data.parts, data.regions);
  if (issues.length) return NextResponse.json({ error: "Not ready to publish", issues }, { status: 422 });
  await db
    .update(schema.papers)
    .set({ status: "published", statusReason: null, publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.papers.id, id));
  return NextResponse.json({ ok: true, status: "published" });
}
