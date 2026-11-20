import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { getObjectStream } from "@/lib/storage";
import { msFileVersion } from "@/lib/mark-schemes/server";

export const runtime = "nodejs";

/** A paper's mark scheme PDF: admins always; teachers once the paper and its mark scheme are published. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
      // Asked for by version (?v=…, the app always does): that file never changes, keep it.
      // Otherwise always check, so a replaced mark scheme is never shown from an old copy.
      "Cache-Control": new URL(req.url).searchParams.get("v") === msFileVersion(row.fileKey) ? "private, max-age=31536000, immutable" : "private, no-cache",
      "X-Robots-Tag": "noindex",
    },
  });
}
