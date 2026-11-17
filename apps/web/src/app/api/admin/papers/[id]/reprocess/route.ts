import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { enqueueSegmentPaper } from "@/lib/jobs/queue";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const { id } = await params;
  const [paper] = await db.select({ id: schema.papers.id }).from(schema.papers).where(eq(schema.papers.id, id));
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await enqueueSegmentPaper(id);
  await db
    .update(schema.papers)
    .set({ status: "processing", statusReason: null, updatedAt: new Date() })
    .where(eq(schema.papers.id, id));
  return NextResponse.json({ ok: true });
}
