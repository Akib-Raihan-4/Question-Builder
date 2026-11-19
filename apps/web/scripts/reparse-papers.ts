/**
 * Run the question finder again on every paper (after a parser improvement), keeping what was
 * published published when it still passes the publish checks. Hand-edited boxes, marks and
 * labels are kept; papers whose questions were split/merged by hand are skipped.
 *   tsx --env-file=.env.local scripts/reparse-papers.ts
 * Needs the processor (PROCESSOR_URL) and storage.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { runSegmentPaper } from "../src/lib/jobs/segment-paper";
import { loadReview } from "../src/lib/review/load";
import { publishIssues } from "../src/lib/review/checks";

async function main() {
  const papers = await db.select().from(schema.papers);
  let ok = 0;
  for (const p of papers) {
    const name = `${p.paperCode} ${p.series} ${p.year}`;
    if (p.structureEdited || p.parserKey !== "edexcel") {
      console.log(`- ${name}: skipped (${p.structureEdited ? "questions edited by hand" : "marked by hand"})`);
      continue;
    }
    try {
      await runSegmentPaper(p.id);
      let status = "needs review";
      if (p.status === "published") {
        const data = await loadReview(p.id);
        const issues = data ? publishIssues(data.questions, data.parts, data.regions) : ["missing"];
        if (!issues.length) {
          await db.update(schema.papers).set({ status: "published", publishedAt: p.publishedAt, statusReason: null }).where(eq(schema.papers.id, p.id));
          status = "published";
        } else status = `needs review (${issues.length} issue${issues.length === 1 ? "" : "s"})`;
      }
      console.log(`✓ ${name}: ${status}`);
      ok++;
    } catch (e) {
      console.log(`✗ ${name}: ${(e as Error).message}`);
    }
  }
  console.log(`Done: ${ok}/${papers.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
