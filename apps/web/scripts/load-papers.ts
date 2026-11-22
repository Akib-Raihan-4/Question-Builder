/**
 * Load a folder of question papers into one subject and find their questions (bulk setup).
 * Series and year come from the file name ("January 2021 QP.pdf", "June 2024 QP.pdf");
 * papers already uploaded (same code, series and year) are skipped. Papers wait for review.
 *   tsx --env-file=.env.local scripts/load-papers.ts <folder> <paperCode> <uploader email>
 *   e.g. scripts/load-papers.ts "../../samples/IAL-P3-pmt" WMA13/01 admin@example.com
 * The subject is the one whose spec code the paper code starts with (WMA13/01 → WMA13/01 or WMA13).
 * Needs the processor (PROCESSOR_URL) and storage.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { paperFileKey, putPdf } from "../src/lib/storage";
import { runSegmentPaper } from "../src/lib/jobs/segment-paper";

const SERIES: Record<string, string> = { JANUARY: "January", JUNE: "June", OCTOBER: "October", NOVEMBER: "November", MAY: "June" };

async function main() {
  const [folder, paperCode, email] = process.argv.slice(2);
  if (!folder || !paperCode || !email) throw new Error("usage: load-papers.ts <folder> <paperCode> <uploader email>");
  const [user] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email));
  if (!user) throw new Error(`No user ${email}`);
  const subjects = await db.select().from(schema.subjects);
  const subject = subjects
    .filter((s) => paperCode === s.specCode || paperCode.startsWith(`${s.specCode}/`) || paperCode.startsWith(s.specCode))
    .sort((a, b) => b.specCode.length - a.specCode.length)[0];
  if (!subject) throw new Error(`No subject for ${paperCode}`);
  console.log(`Subject: ${subject.name} (${subject.specCode})`);

  for (const name of readdirSync(folder).filter((f) => /QP\.pdf$/i.test(f)).sort()) {
    const m = name.match(/(January|June|October|November)\s+(\d{4})/i);
    if (!m) {
      console.log(`? ${name}: no series/year in the name`);
      continue;
    }
    const series = SERIES[m[1].toUpperCase()];
    const year = Number(m[2]);
    const label = `${paperCode} ${series} ${year}`;
    const [exists] = await db
      .select({ id: schema.papers.id })
      .from(schema.papers)
      .where(and(eq(schema.papers.paperCode, paperCode), eq(schema.papers.series, series), eq(schema.papers.year, year)));
    if (exists) {
      console.log(`- ${label}: already uploaded, skipped`);
      continue;
    }
    const bytes = new Uint8Array(readFileSync(join(folder, name)));
    const id = crypto.randomUUID();
    const fileKey = paperFileKey(id);
    await db.insert(schema.papers).values({
      id,
      subjectId: subject.id,
      paperCode,
      series,
      year,
      tier: null,
      fileKey,
      originalFilename: name,
      fileSize: bytes.length,
      parserKey: subject.board,
      status: "uploaded",
      uploadedBy: user.id,
    });
    await putPdf(fileKey, bytes);
    await db.update(schema.papers).set({ status: "processing", updatedAt: new Date() }).where(eq(schema.papers.id, id));
    await runSegmentPaper(id);
    const qs = await db.select({ marks: schema.questions.totalMarks }).from(schema.questions).where(eq(schema.questions.paperId, id));
    const [p] = await db.select({ status: schema.papers.status, reason: schema.papers.statusReason, v: schema.papers.parserVersion }).from(schema.papers).where(eq(schema.papers.id, id));
    console.log(`✓ ${label}: ${qs.length} questions, ${qs.reduce((s, q) => s + q.marks, 0)} marks · ${p.status} · parser ${p.v}${p.reason ? ` · ${p.reason}` : ""}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
