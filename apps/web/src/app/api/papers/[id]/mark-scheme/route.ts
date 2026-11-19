import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { getObjectStream } from "@/lib/storage";

export const runtime = "nodejs";

/** A paper's mark scheme PDF: admins always; teachers once the paper and its mark scheme are published. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const id = (await params).id;
  const [row] = await db
    .select({ fileKey: schema.markSchemes.fileKey, msStatus: schema.markSchemes.status, paperStatus: schema.papers.status })
    .from(schema.markSchemes)
    .innerJoin(schema.papers, eq(schema.papers.id, schema.markSchemes.paperId))
    .where(eq(schema.markSchemes.paperId, id));
  if (!row || (u.role !== "admin" && (row.msStatus !== "published" || row.paperStatus !== "published"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { body, length } = await getObjectStream(row.fileKey);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      // Streamed responses can lose Content-Length on the way, so the size also goes in a header
      // of our own: the app uses it to show real download progress.
      ...(length ? { "Content-Length": String(length), "X-File-Size": String(length) } : {}),
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
