/**
 * One-off: find the page layout (answer dots etc.) for every paper that doesn't have it yet.
 * Needs the processor running (PROCESSOR_URL) and storage access.
 *   npm run backfill:layout -w web
 */
import { isNull } from "drizzle-orm";
import { db, schema } from "../src/db";
import { saveLayout } from "../src/lib/papers/layout";
import { getObjectBytes } from "../src/lib/storage";

async function main() {
  const papers = await db
    .select({ id: schema.papers.id, fileKey: schema.papers.fileKey, code: schema.papers.paperCode, series: schema.papers.series, year: schema.papers.year })
    .from(schema.papers)
    .where(isNull(schema.papers.layout));
  console.log(`${papers.length} paper(s) without a layout`);
  let ok = 0;
  for (const p of papers) {
    const done = await saveLayout(p.id, await getObjectBytes(p.fileKey));
    console.log(`${done ? "✓" : "✗"} ${p.code} ${p.series} ${p.year}`);
    if (done) ok++;
  }
  console.log(`Done: ${ok}/${papers.length}`);
  process.exit(ok === papers.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
