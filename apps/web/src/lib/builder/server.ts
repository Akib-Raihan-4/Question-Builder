import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PaperHeader } from "@/db/schema";
import type { Role } from "@/lib/auth";
import type { BankQuestion, Item } from "./model";

export const paperLabel = (p: { paperCode: string; series: string; year: number }) =>
  `${p.paperCode} ${p.series} ${p.year}`;

/** Published papers a teacher can pick from (admins see the same list). */
export async function listSourcePapers() {
  return db
    .select({
      id: schema.papers.id,
      subjectId: schema.subjects.id,
      subject: schema.subjects.name,
      specCode: schema.subjects.specCode,
      paperCode: schema.papers.paperCode,
      series: schema.papers.series,
      year: schema.papers.year,
      tier: schema.papers.tier,
      pageCount: schema.papers.pageCount,
    })
    .from(schema.papers)
    .innerJoin(schema.subjects, eq(schema.subjects.id, schema.papers.subjectId))
    .where(eq(schema.papers.status, "published"))
    .orderBy(asc(schema.subjects.specCode), desc(schema.papers.year), asc(schema.papers.series), asc(schema.papers.paperCode));
}

/** Questions with parts and boxes, shaped for the builder. */
export async function loadBankQuestions(where: { paperId?: string; questionIds?: string[] }): Promise<BankQuestion[]> {
  const cond = where.paperId
    ? eq(schema.questions.paperId, where.paperId)
    : where.questionIds?.length
      ? inArray(schema.questions.id, where.questionIds)
      : null;
  if (!cond) return [];
  const qs = await db
    .select({ q: schema.questions, p: schema.papers })
    .from(schema.questions)
    .innerJoin(schema.papers, eq(schema.papers.id, schema.questions.paperId))
    .where(cond)
    .orderBy(asc(schema.questions.number));
  if (!qs.length) return [];
  const qIds = qs.map((x) => x.q.id);
  const parts = await db
    .select()
    .from(schema.questionParts)
    .where(inArray(schema.questionParts.questionId, qIds))
    .orderBy(asc(schema.questionParts.sortOrder));
  const regions = await db
    .select()
    .from(schema.regions)
    .where(inArray(schema.regions.ownerId, [...qIds, ...parts.map((p) => p.id)]))
    .orderBy(asc(schema.regions.page), asc(schema.regions.y0));
  const reg = (ownerId: string) =>
    regions.filter((r) => r.ownerId === ownerId).map(({ page, x0, y0, x1, y1 }) => ({ page, x0, y0, x1, y1 }));
  return qs.map(({ q, p }) => ({
    id: q.id,
    paperId: p.id,
    paperLabel: paperLabel(p),
    number: q.number,
    totalMarks: q.totalMarks,
    regions: reg(q.id),
    parts: parts
      .filter((pt) => pt.questionId === q.id)
      .map((pt) => ({ id: pt.id, label: pt.label, marks: pt.marks, sortOrder: pt.sortOrder, regions: reg(pt.id) })),
  }));
}

/** A source paper for the browse pane; teachers only get published papers. */
export async function loadSourcePaper(paperId: string, role: Role) {
  const [p] = await db.select().from(schema.papers).where(eq(schema.papers.id, paperId));
  if (!p || (p.status !== "published" && role !== "admin")) return null;
  return {
    paper: { id: p.id, label: paperLabel(p), pageCount: p.pageCount },
    questions: await loadBankQuestions({ paperId }),
  };
}

export async function getBuiltPaper(id: string, ownerId: string) {
  const [bp] = await db
    .select()
    .from(schema.builtPapers)
    .where(and(eq(schema.builtPapers.id, id), eq(schema.builtPapers.ownerId, ownerId)));
  if (!bp) return null;
  const rows = await db
    .select()
    .from(schema.builtPaperItems)
    .where(eq(schema.builtPaperItems.builtPaperId, id))
    .orderBy(asc(schema.builtPaperItems.position));
  const items: Item[] = rows.map((r) => ({ questionId: r.questionId, partIds: r.partIds }));
  const bank = await loadBankQuestions({ questionIds: items.map((i) => i.questionId) });
  return { id: bp.id, title: bp.title, header: bp.headerJson as PaperHeader, items, bank, updatedAt: bp.updatedAt };
}
