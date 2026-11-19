import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { reviewQueue } from "@/lib/mark-schemes/server";

export const maxDuration = 60;

/** Which mark schemes waiting for review are ready (all parts linked, all marks match). */
export async function GET(req: Request) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const subjectId = new URL(req.url).searchParams.get("subjectId") ?? undefined;
  return NextResponse.json({ queue: await reviewQueue(subjectId) });
}

/** Publish every ready one (the check runs again here). */
export async function POST(req: Request) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const subjectId = new URL(req.url).searchParams.get("subjectId") ?? undefined;
  const queue = await reviewQueue(subjectId);
  const ready = queue.filter((q) => q.ready).map((q) => q.id);
  if (ready.length) {
    await db
      .update(schema.markSchemes)
      .set({ status: "published", statusReason: null, publishedAt: new Date(), updatedAt: new Date() })
      .where(inArray(schema.markSchemes.id, ready));
  }
  return NextResponse.json({ published: ready.length, notReady: queue.filter((q) => !q.ready) });
}
