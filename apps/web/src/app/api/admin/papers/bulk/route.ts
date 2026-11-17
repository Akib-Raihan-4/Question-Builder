import { NextResponse } from "next/server";
import { unzipSync } from "fflate";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { createPaper } from "@/lib/papers/create";
import { parsePaperFilename } from "@/lib/paper-filename";

export const runtime = "nodejs";
export const maxDuration = 300;

type Row = { file: string; ok: boolean; message: string; paperId?: string };

export async function POST(req: Request) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;

  const form = await req.formData();
  const zip = form.get("file");
  if (!(zip instanceof File)) return NextResponse.json({ error: "Choose a ZIP file" }, { status: 400 });

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await zip.arrayBuffer()), {
      filter: (f) => f.name.toLowerCase().endsWith(".pdf") && !f.name.includes("__MACOSX/"),
    });
  } catch {
    return NextResponse.json({ error: "Could not read the ZIP file" }, { status: 400 });
  }

  const subjects = await db.select().from(schema.subjects).where(eq(schema.subjects.board, "edexcel"));
  const bySpec = new Map(subjects.map((s) => [s.specCode, s]));
  const results: Row[] = [];

  for (const [path, bytes] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
    const name = path.split("/").pop()!;
    const meta = parsePaperFilename(name);
    if (!meta) {
      results.push({ file: name, ok: false, message: "Skipped: file name not recognised as a question paper" });
      continue;
    }
    const subject = bySpec.get(meta.specCode);
    if (!subject) {
      results.push({ file: name, ok: false, message: `Skipped: subject ${meta.specCode} is not set up` });
      continue;
    }
    const r = await createPaper({ ...meta, subjectId: subject.id, bytes, filename: name, uploadedBy: u.userId });
    results.push(
      r.ok
        ? { file: name, ok: true, paperId: r.paperId, message: `${meta.paperCode} ${meta.series} ${meta.year}` }
        : { file: name, ok: false, message: r.error },
    );
  }

  return NextResponse.json({ results, created: results.filter((r) => r.ok).length });
}
