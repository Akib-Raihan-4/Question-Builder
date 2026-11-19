/**
 * Load a folder of mark schemes into the database and read them (test data / bulk setup).
 * Files are matched to papers by "<Series> <Year>" in the file name and the given paper code.
 *   tsx --env-file=.env.local scripts/load-mark-schemes.ts <folder> <paperCode>
 *   e.g. scripts/load-mark-schemes.ts "../../samples/Physics-Unit-3-MS" WPH13/01
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { msFileKey, readMarkScheme } from "../src/lib/mark-schemes/server";
import { putPdf } from "../src/lib/storage";

async function main() {
  const [folder, paperCode] = process.argv.slice(2);
  if (!folder || !paperCode) throw new Error("usage: load-mark-schemes.ts <folder> <paperCode>");
  for (const name of readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()) {
    const m = name.match(/(January|June|October|November)\s+(\d{4})/i);
    if (!m) {
      console.log(`? ${name}: no series/year in the name`);
      continue;
    }
    const [paper] = await db
      .select({ id: schema.papers.id })
      .from(schema.papers)
      .where(and(eq(schema.papers.paperCode, paperCode), eq(schema.papers.series, m[1]), eq(schema.papers.year, Number(m[2]))));
    if (!paper) {
      console.log(`- ${name}: no ${paperCode} ${m[1]} ${m[2]} paper`);
      continue;
    }
    const bytes = new Uint8Array(readFileSync(join(folder, name)));
    await putPdf(msFileKey(paper.id), bytes);
    const values = { fileKey: msFileKey(paper.id), originalFilename: name, fileSize: bytes.length, status: "processing" as const, statusReason: null, publishedAt: null, updatedAt: new Date() };
    const [ms] = await db.insert(schema.markSchemes).values({ paperId: paper.id, ...values }).onConflictDoUpdate({ target: schema.markSchemes.paperId, set: values }).returning({ id: schema.markSchemes.id });
    await db.delete(schema.msRegions).where(eq(schema.msRegions.markSchemeId, ms.id));
    const out = await readMarkScheme(paper.id);
    console.log(`✓ ${name}: ${JSON.stringify(out)}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
