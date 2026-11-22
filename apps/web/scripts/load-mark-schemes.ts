/**
 * Load a folder of mark schemes into the database and read them (test data / bulk setup).
 * Files are matched to papers by series and year in the file name ("January 2024 (IAL) MS",
 * "IGCSE_MATHEMATICS_B_2020_MayJune_P2R_MS", "IAL_PHYSICS_2020_June_U3_MS") and the paper code:
 * a full code (WPH13/01), or just the spec code (4MB1) to take the paper from "P1" / "P2R".
 *   tsx --env-file=.env.local scripts/load-mark-schemes.ts <folder> <paperCode | specCode>
 *   e.g. scripts/load-mark-schemes.ts "../../samples/Physics-Unit-3-MS" WPH13/01
 *        scripts/load-mark-schemes.ts "../../samples/Maths-B-MS" 4MB1
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { msFileKey, readMarkScheme } from "../src/lib/mark-schemes/server";
import { deleteObject, putPdf } from "../src/lib/storage";

async function main() {
  const [folder, paperCode] = process.argv.slice(2);
  if (!folder || !paperCode) throw new Error("usage: load-mark-schemes.ts <folder> <paperCode>");
  for (const name of readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()) {
    const SERIES: Record<string, string> = { SPECIMEN: "Specimen", JAN: "January", JANUARY: "January", JUNE: "June", JUN: "June", MAYJUNE: "June", MJ: "June", OCT: "October", OCTOBER: "October", NOV: "November", NOVEMBER: "November" };
    const a = name.match(/(January|June|October|November|Specimen)\s+(\d{4})/i);
    const b = name.match(/(20\d{2})_(Jan|January|June|Jun|MayJune|MJ|Oct|October|Nov|November)(?:_|\b)/i);
    const series = a ? SERIES[a[1].toUpperCase()] : b ? SERIES[b[2].toUpperCase()] : null;
    const year = a ? Number(a[2]) : b ? Number(b[1]) : null;
    if (!series || !year || !/_?MS/i.test(name)) {
      console.log(`? ${name}: no series/year in the name (or not a mark scheme)`);
      continue;
    }
    const pTok = name.match(/_P(\d{1,2})(R?)_/i);
    const code = paperCode.includes("/") ? paperCode : pTok ? `${paperCode}/${pTok[1].padStart(2, "0")}${pTok[2].toUpperCase()}` : null;
    if (!code) {
      console.log(`? ${name}: give a full paper code, or name files with _P1_ / _P2R_`);
      continue;
    }
    const m = [name, series, String(year)];
    const [paper] = await db
      .select({ id: schema.papers.id })
      .from(schema.papers)
      .where(and(eq(schema.papers.paperCode, code), eq(schema.papers.series, m[1]), eq(schema.papers.year, Number(m[2]))));
    if (!paper) {
      console.log(`- ${name}: no ${code} ${m[1]} ${m[2]} paper`);
      continue;
    }
    const bytes = new Uint8Array(readFileSync(join(folder, name)));
    const [old] = await db.select({ fileKey: schema.markSchemes.fileKey }).from(schema.markSchemes).where(eq(schema.markSchemes.paperId, paper.id));
    const fileKey = msFileKey(paper.id);
    await putPdf(fileKey, bytes);
    const values = { fileKey, originalFilename: name, fileSize: bytes.length, status: "processing" as const, statusReason: null, publishedAt: null, updatedAt: new Date() };
    const [ms] = await db.insert(schema.markSchemes).values({ paperId: paper.id, ...values }).onConflictDoUpdate({ target: schema.markSchemes.paperId, set: values }).returning({ id: schema.markSchemes.id });
    await db.delete(schema.msRegions).where(eq(schema.msRegions.markSchemeId, ms.id));
    if (old && old.fileKey !== fileKey) await deleteObject(old.fileKey).catch(() => {});
    const out = await readMarkScheme(paper.id);
    console.log(`✓ ${name}: ${JSON.stringify(out)}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
