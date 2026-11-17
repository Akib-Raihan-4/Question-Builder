import { NextResponse } from "next/server";
import { unzipSync } from "fflate";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { createPaper } from "@/lib/papers/create";
import { parsePaperFilename, SERIES, type Series } from "@/lib/paper-filename";
import { matchSubject, readCover } from "@/lib/papers/inspect";

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

  const subjects = await db.select().from(schema.subjects);
  const autoDetect = form.get("autoDetect") !== "false";
  const results: Row[] = [];

  for (const [path, bytes] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
    const name = path.split("/").pop()!;
    // File name first; otherwise read the cover page (paper code, series, year).
    let meta = parsePaperFilename(name);
    if (!meta) {
      const c = await readCover(bytes);
      if (c?.paper_code && c.series && c.year && SERIES.includes(c.series as Series)) {
        meta = { specCode: "", paperCode: c.paper_code, series: c.series as Series, year: c.year, tier: c.tier };
      }
    }
    if (!meta) {
      results.push({ file: name, ok: false, message: "Skipped: couldn't tell the paper code/series/year from the name or cover — upload it on its own" });
      continue;
    }
    const subject = matchSubject(meta.paperCode, subjects);
    if (!subject) {
      results.push({ file: name, ok: false, message: `Skipped: no subject for ${meta.paperCode} — add the subject first` });
      continue;
    }
    const r = await createPaper({ ...meta, subjectId: subject.id, bytes, filename: name, uploadedBy: u.userId, autoDetect });
    results.push(
      r.ok
        ? { file: name, ok: true, paperId: r.paperId, message: `${meta.paperCode} ${meta.series} ${meta.year}` }
        : { file: name, ok: false, message: r.error },
    );
  }

  return NextResponse.json({ results, created: results.filter((r) => r.ok).length });
}
