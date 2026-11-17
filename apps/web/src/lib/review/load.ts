import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ReviewData } from "./types";

export async function loadReview(paperId: string): Promise<ReviewData | null> {
  const [row] = await db
    .select({ paper: schema.papers, subject: schema.subjects })
    .from(schema.papers)
    .innerJoin(schema.subjects, eq(schema.subjects.id, schema.papers.subjectId))
    .where(eq(schema.papers.id, paperId));
  if (!row) return null;
  const { paper, subject } = row;

  const questions = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.paperId, paperId))
    .orderBy(asc(schema.questions.number));
  const qIds = questions.map((q) => q.id);
  const parts = qIds.length
    ? await db
        .select()
        .from(schema.questionParts)
        .where(inArray(schema.questionParts.questionId, qIds))
        .orderBy(asc(schema.questionParts.sortOrder))
    : [];
  const owners = [...qIds, ...parts.map((p) => p.id)];
  const regions = owners.length
    ? await db
        .select()
        .from(schema.regions)
        .where(inArray(schema.regions.ownerId, owners))
        .orderBy(asc(schema.regions.sortOrder))
    : [];
  const qTopics = qIds.length
    ? await db.select().from(schema.questionTopics).where(inArray(schema.questionTopics.questionId, qIds))
    : [];
  const topics = await db
    .select({ id: schema.topics.id, code: schema.topics.code, name: schema.topics.name, parentId: schema.topics.parentId })
    .from(schema.topics)
    .where(eq(schema.topics.subjectId, subject.id))
    .orderBy(asc(schema.topics.sortOrder));

  return {
    paper: {
      id: paper.id,
      label: `${paper.paperCode} · ${paper.series} ${paper.year}`,
      subject: `${subject.specCode} ${subject.name}`,
      status: paper.status,
      structureEdited: paper.structureEdited,
      parserVersion: paper.parserVersion,
      pageCount: paper.pageCount,
    },
    questions: questions.map((q) => ({
      id: q.id,
      number: q.number,
      totalMarks: q.totalMarks,
      confidence: q.confidence,
      warnings: q.warnings,
      editedByAdmin: q.editedByAdmin,
      topicIds: qTopics.filter((t) => t.questionId === q.id).map((t) => t.topicId),
    })),
    parts: parts.map((p) => ({
      id: p.id, questionId: p.questionId, label: p.label, sortOrder: p.sortOrder, marks: p.marks, editedByAdmin: p.editedByAdmin,
    })),
    regions: regions.map((r) => ({
      id: r.id, ownerType: r.ownerType, ownerId: r.ownerId, page: r.page,
      x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, sortOrder: r.sortOrder, editedByAdmin: r.editedByAdmin,
    })),
    topics,
  };
}
