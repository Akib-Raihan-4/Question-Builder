import { and, asc, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { loadBankQuestions } from "./server";
import type { BankQuestion } from "./model";
import { searchWords, snippet } from "./highlight";
import { SERIES } from "@/lib/paper-filename";

/** Search filters. Topic search is postponed (no topics yet). */
export const SearchParams = z.object({
  subjectId: z.string().uuid().optional(),
  paperId: z.string().uuid().optional(),
  series: z.enum(SERIES).optional(),
  /** Paper number, e.g. 2 = Paper 2 and its regional version 2R. */
  paperNo: z.coerce.number().int().min(1).max(9).optional(),
  yearFrom: z.coerce.number().int().min(2000).max(2100).optional(),
  yearTo: z.coerce.number().int().min(2000).max(2100).optional(),
  minMarks: z.coerce.number().int().min(0).max(100).optional(),
  maxMarks: z.coerce.number().int().min(0).max(100).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["paper", "marks", "popular"]).default("paper"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type SearchParams = z.infer<typeof SearchParams>;

/** snippet: a little of the question's text around the search words. */
export type SearchHit = BankQuestion & { uses: number; snippet: string };

/** Questions from PUBLISHED papers only, with how often teachers have used each. */
export async function searchQuestions(p: SearchParams): Promise<{ total: number; hits: SearchHit[] }> {
  const conds: SQL[] = [eq(schema.papers.status, "published")];
  if (p.subjectId) conds.push(eq(schema.papers.subjectId, p.subjectId));
  if (p.paperId) conds.push(eq(schema.papers.id, p.paperId));
  if (p.series) conds.push(eq(schema.papers.series, p.series));
  if (p.paperNo) conds.push(sql`${schema.papers.paperCode} ~ ${`^[^/]+/0*${p.paperNo}[A-Z]*$`}`);
  if (p.yearFrom) conds.push(gte(schema.papers.year, p.yearFrom));
  if (p.yearTo) conds.push(lte(schema.papers.year, p.yearTo));
  if (p.minMarks !== undefined) conds.push(gte(schema.questions.totalMarks, p.minMarks));
  if (p.maxMarks !== undefined) conds.push(lte(schema.questions.totalMarks, p.maxMarks));
  if (p.q) {
    for (const word of p.q.split(/\s+/).filter(Boolean).slice(0, 6)) {
      conds.push(ilike(schema.questions.text, `%${word.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
    }
  }
  const uses = sql<number>`(select count(*)::int from ${schema.builtPaperItems} i where i.question_id = ${schema.questions.id})`;
  const order =
    p.sort === "marks"
      ? [desc(schema.questions.totalMarks), desc(schema.papers.year), asc(schema.questions.number)]
      : p.sort === "popular"
        ? [desc(uses), desc(schema.papers.year), asc(schema.questions.number)]
        : [desc(schema.papers.year), asc(schema.papers.series), asc(schema.papers.paperCode), asc(schema.questions.number)];

  const rows = await db
    .select({ id: schema.questions.id, text: schema.questions.text, uses, total: sql<number>`count(*) over ()::int` })
    .from(schema.questions)
    .innerJoin(schema.papers, eq(schema.papers.id, schema.questions.paperId))
    .where(and(...conds))
    .orderBy(...order)
    .limit(p.limit)
    .offset(p.offset);
  if (!rows.length) return { total: 0, hits: [] };

  const bank = new Map((await loadBankQuestions({ questionIds: rows.map((r) => r.id) })).map((q) => [q.id, q]));
  return {
    total: rows[0].total,
    hits: rows
      .filter((r) => bank.has(r.id))
      .map((r) => ({ ...bank.get(r.id)!, uses: r.uses, snippet: snippet(r.text, searchWords(p.q ?? "")) })),
  };
}

/** Most-used questions across all teachers' papers (admin analytics). */
export async function mostUsedQuestions(limit = 15) {
  return db
    .select({
      questionId: schema.questions.id,
      number: schema.questions.number,
      totalMarks: schema.questions.totalMarks,
      paperId: schema.papers.id,
      paperCode: schema.papers.paperCode,
      series: schema.papers.series,
      year: schema.papers.year,
      uses: sql<number>`count(${schema.builtPaperItems.id})::int`,
      papers: sql<number>`count(distinct ${schema.builtPaperItems.builtPaperId})::int`,
    })
    .from(schema.builtPaperItems)
    .innerJoin(schema.questions, eq(schema.questions.id, schema.builtPaperItems.questionId))
    .innerJoin(schema.papers, eq(schema.papers.id, schema.questions.paperId))
    .groupBy(schema.questions.id, schema.papers.id)
    .orderBy(desc(sql`count(${schema.builtPaperItems.id})`), asc(schema.papers.year))
    .limit(limit);
}
