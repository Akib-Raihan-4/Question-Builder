import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { getBuiltPaper } from "@/lib/builder/server";
import { buildPaperPdf } from "@/lib/export/build-pdf";
import { getObjectBytes } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Export the teacher's paper as one PDF (server-side, vector crops of the originals). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const bp = await getBuiltPaper((await params).id, u.userId);
  if (!bp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!bp.items.length) return NextResponse.json({ error: "Add some questions first" }, { status: 400 });

  const bank = Object.fromEntries(bp.bank.map((q) => [q.id, q]));
  const items = bp.items.filter((i) => bank[i.questionId]);
  const paperIds = [...new Set(items.map((i) => bank[i.questionId].paperId))];
  const files = await db
    .select({ id: schema.papers.id, fileKey: schema.papers.fileKey })
    .from(schema.papers)
    .where(inArray(schema.papers.id, paperIds));
  const keyOf = new Map(files.map((f) => [f.id, f.fileKey]));

  const pdf = await buildPaperPdf({
    title: bp.title,
    header: bp.header,
    items,
    bank,
    loadSource: (paperId) => getObjectBytes(keyOf.get(paperId)!),
  });
  const filename = (bp.header.title || bp.title).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "paper";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
