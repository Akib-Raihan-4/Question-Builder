import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { getBuiltPaper } from "@/lib/builder/server";
import { buildPaperPdf } from "@/lib/export/build-pdf";
import { buildPaperDocx } from "@/lib/export/build-docx";
import { getObjectBytes, putFile, signedDownloadUrl } from "@/lib/storage";
import { brandingForExport } from "@/lib/branding";
import { buildMarkSchemePdf, type MsRowInput } from "@/lib/export/build-ms-pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Export the teacher's paper.
 *   ?format=pdf (default)                  one PDF, vector crops of the originals
 *   ?format=docx&mode=pictures|editable    Word: questions as pictures, or as editable text
 *   ?format=ms                             the matching mark scheme (PDF)
 *   ?format=pdf&ms=1                       paper, then its mark scheme, in one PDF
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "docx" ? "docx" : "pdf";
  const loadSource = (paperId: string) => getObjectBytes(keyOf.get(paperId)!);
  const branding = await brandingForExport(u.userId, bp.header);
  const filename = (bp.header.title || bp.title).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "paper";

  // The file is saved privately in storage and downloaded through a link that expires in a few
  // minutes: exports can be bigger than a hosting response allows (~4.5 MB on Vercel).
  // One object per paper and format, overwritten on each export.
  const deliver = async (bytes: Uint8Array, name: string, contentType: string, kind: string) => {
    const key = `exports/${bp.id}/${kind}`;
    await putFile(key, bytes, contentType);
    return NextResponse.json({ url: await signedDownloadUrl(key, name, contentType), filename: name, bytes: bytes.length });
  };

  if (format === "docx") {
    const mode = url.searchParams.get("mode") === "editable" ? "editable" : "pictures";
    try {
      const docx = await buildPaperDocx({ title: bp.title, header: bp.header, items, bank, mode, loadSource, branding });
      return deliver(
        docx,
        `${filename}${mode === "editable" ? "_editable" : ""}.docx`,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        `${mode}.docx`,
      );
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  // Published mark scheme rows for the paper's questions, in mark-scheme order.
  const withMs = format === "pdf" && url.searchParams.get("ms") === "1";
  const wantMs = url.searchParams.get("format") === "ms" || withMs;
  let markScheme: { pdf: Uint8Array; missing: number[] } | null = null;
  if (wantMs) {
    const regs = await db
      .select({
        questionId: schema.msRegions.questionId,
        partId: schema.msRegions.partId,
        label: schema.msRegions.label,
        page: schema.msRegions.page,
        x0: schema.msRegions.x0,
        y0: schema.msRegions.y0,
        x1: schema.msRegions.x1,
        y1: schema.msRegions.y1,
        paperId: schema.markSchemes.paperId,
        fileKey: schema.markSchemes.fileKey,
      })
      .from(schema.msRegions)
      .innerJoin(schema.markSchemes, eq(schema.markSchemes.id, schema.msRegions.markSchemeId))
      .where(and(inArray(schema.msRegions.questionId, items.map((i) => i.questionId)), eq(schema.markSchemes.status, "published")))
      .orderBy(asc(schema.msRegions.page), asc(schema.msRegions.y0), asc(schema.msRegions.sortOrder));
    const rows = new Map<string, MsRowInput[]>();
    const msKey = new Map<string, string>();
    for (const r of regs) {
      msKey.set(r.paperId, r.fileKey);
      const list = rows.get(r.questionId!) ?? [];
      let row = list.find((x) => x.label === r.label);
      if (!row) list.push((row = { label: r.label, partId: r.partId, regions: [] }));
      row.regions.push({ page: r.page, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });
      rows.set(r.questionId!, list);
    }
    if (!regs.length) return NextResponse.json({ error: "None of these questions has a published mark scheme yet" }, { status: 400 });
    markScheme = await buildMarkSchemePdf({
      title: bp.title,
      header: bp.header,
      items,
      bank,
      rows,
      loadMarkScheme: (paperId) => getObjectBytes(msKey.get(paperId)!),
    });
  }
  if (markScheme && !withMs) {
    return deliver(markScheme.pdf, `${filename}_mark_scheme.pdf`, "application/pdf", "mark-scheme.pdf");
  }

  const pdf = await buildPaperPdf({ title: bp.title, header: bp.header, items, bank, loadSource, branding });
  if (markScheme) {
    // Paper first, then the mark scheme, in one file.
    const both = await PDFDocument.load(pdf);
    const ms = await PDFDocument.load(markScheme.pdf);
    for (const p of await both.copyPages(ms, ms.getPageIndices())) both.addPage(p);
    return deliver(await both.save(), `${filename}_with_mark_scheme.pdf`, "application/pdf", "paper-and-ms.pdf");
  }
  return deliver(pdf, `${filename}.pdf`, "application/pdf", "paper.pdf");
}
