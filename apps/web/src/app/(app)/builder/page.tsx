import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { NewPaperButton } from "./paper-actions";
import { MyPapersList } from "./my-papers-list";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function MyPapersPage() {
  const { user } = await requireUser();
  const papers = await db
    .select({
      id: schema.builtPapers.id,
      title: schema.builtPapers.title,
      updatedAt: schema.builtPapers.updatedAt,
      // Outer column written out in full: Drizzle leaves single-table columns unqualified.
      items: sql<number>`(select count(*)::int from built_paper_items i where i.built_paper_id = built_papers.id)`,
      // Item marks = whole question's total, or the sum of the chosen parts.
      marks: sql<number>`(
        select coalesce(sum(case when jsonb_array_length(i.part_ids) = 0 then q.total_marks
          else (select coalesce(sum(qp.marks), 0) from question_parts qp
                where qp.id::text in (select jsonb_array_elements_text(i.part_ids))) end), 0)::int
        from built_paper_items i join questions q on q.id = i.question_id
        where i.built_paper_id = built_papers.id)`,
      subjects: sql<string[]>`coalesce((
        select array_agg(distinct s.name order by s.name)
        from built_paper_items i join questions q on q.id = i.question_id
        join papers p on p.id = q.paper_id join subjects s on s.id = p.subject_id
        where i.built_paper_id = built_papers.id), '{}')`,
    })
    .from(schema.builtPapers)
    .where(eq(schema.builtPapers.ownerId, user.id))
    .orderBy(desc(schema.builtPapers.updatedAt));

  return (
    <div className="space-y-6">
      <PageHeader
        title="My papers"
        description="Build a paper by clicking questions in past papers. Numbers and totals update as you go."
        actions={<NewPaperButton />}
      />
      <MyPapersList papers={papers.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() }))} />
    </div>
  );
}
