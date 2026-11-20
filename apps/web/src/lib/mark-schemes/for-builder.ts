import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ownBoxes } from "@/lib/builder/own-boxes";
import { msFileVersion } from "./server";

/** One mark scheme row of a question: label as printed ("2(a)(i)"), its marks and boxes. */
export type MsRow = {
  label: string;
  partId: string | null;
  marks: number | null;
  regions: { page: number; x0: number; y0: number; x1: number; y1: number }[];
  /** The teacher's own boxes, not the shared ones. */
  own?: boolean;
};

export type BuilderMarkScheme = {
  /** Rows per question id, in mark scheme order. */
  rows: Map<string, MsRow[]>;
  /** Each source paper's published mark scheme file. */
  files: Map<string, { fileKey: string; version: string }>;
};

/**
 * The published mark scheme rows for some questions, as one teacher sees them: where they drew
 * their own boxes for a question or part, those replace the shared rows for it.
 */
export async function loadBuilderMarkScheme(questionIds: string[], userId?: string): Promise<BuilderMarkScheme> {
  const rows = new Map<string, MsRow[]>();
  const files = new Map<string, { fileKey: string; version: string }>();
  if (!questionIds.length) return { rows, files };
  const regs = await db
    .select({
      questionId: schema.msRegions.questionId,
      partId: schema.msRegions.partId,
      label: schema.msRegions.label,
      marks: schema.msRegions.marks,
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
    .where(and(inArray(schema.msRegions.questionId, questionIds), eq(schema.markSchemes.status, "published")))
    .orderBy(asc(schema.msRegions.page), asc(schema.msRegions.y0), asc(schema.msRegions.sortOrder));
  for (const r of regs) {
    files.set(r.paperId, { fileKey: r.fileKey, version: msFileVersion(r.fileKey) });
    const list = rows.get(r.questionId!) ?? [];
    let row = list.find((x) => x.label === r.label);
    if (!row) list.push((row = { label: r.label, partId: r.partId, marks: r.marks, regions: [] }));
    row.regions.push({ page: r.page, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });
    rows.set(r.questionId!, list);
  }
  if (!userId || !rows.size) return { rows, files };

  // The teacher's own boxes, for questions that have a published mark scheme.
  const withMs = [...rows.keys()];
  const [qs, parts] = await Promise.all([
    db.select({ id: schema.questions.id, number: schema.questions.number }).from(schema.questions).where(inArray(schema.questions.id, withMs)),
    db
      .select({ id: schema.questionParts.id, questionId: schema.questionParts.questionId, label: schema.questionParts.label })
      .from(schema.questionParts)
      .where(inArray(schema.questionParts.questionId, withMs)),
  ]);
  const own = await ownBoxes(userId, "ms", [...withMs, ...parts.map((p) => p.id)]);
  if (!own.size) return { rows, files };
  const numberOf = new Map(qs.map((q) => [q.id, q.number]));
  for (const qid of withMs) {
    let list = rows.get(qid)!;
    const whole = own.get(qid);
    if (whole) list = [{ label: String(numberOf.get(qid) ?? ""), partId: null, marks: null, regions: whole, own: true }];
    for (const p of parts.filter((x) => x.questionId === qid)) {
      const boxes = own.get(p.id);
      if (!boxes) continue;
      const at = list.findIndex((r) => r.partId === p.id);
      const label = at >= 0 ? list[at].label : `${numberOf.get(qid)}(${p.label})`;
      const marks = list.find((r) => r.partId === p.id)?.marks ?? null;
      const row: MsRow = { label, partId: p.id, marks, regions: boxes, own: true };
      list = list.filter((r) => r.partId !== p.id);
      list.splice(at >= 0 ? Math.min(at, list.length) : list.length, 0, row);
    }
    rows.set(qid, list);
  }
  return { rows, files };
}
