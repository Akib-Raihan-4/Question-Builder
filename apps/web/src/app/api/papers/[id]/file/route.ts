import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { getObjectStream } from "@/lib/storage";

export const runtime = "nodejs";

/** The only way a PDF leaves storage: logged-in users; teachers only see published papers. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const { id } = await params;
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, id));
  if (!paper || (u.role !== "admin" && paper.status !== "published")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { body, length } = await getObjectStream(paper.fileKey);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      ...(length ? { "Content-Length": String(length) } : {}),
      "Content-Disposition": `inline; filename="${paper.paperCode.replace("/", "-")}_${paper.series}_${paper.year}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
