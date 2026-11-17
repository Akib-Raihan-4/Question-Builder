import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { enqueueSegmentPaper } from "@/lib/jobs/queue";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Box, marks and label fixes survive a re-run (edited_by_admin). Split/merge and added/removed
  // parts can't be matched back to fresh parser output, so those papers are not re-run.
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const { id } = await params;
  const [paper] = await db
    .select({ id: schema.papers.id, structureEdited: schema.papers.structureEdited })
    .from(schema.papers)
    .where(eq(schema.papers.id, id));
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (paper.structureEdited) {
    return NextResponse.json(
      { error: "Questions on this paper were split, merged or had parts added/removed by hand, so it can't be re-run." },
      { status: 409 },
    );
  }
  await enqueueSegmentPaper(id);
  await db
    .update(schema.papers)
    .set({ status: "processing", statusReason: null, updatedAt: new Date() })
    .where(eq(schema.papers.id, id));
  return NextResponse.json({ ok: true });
}
