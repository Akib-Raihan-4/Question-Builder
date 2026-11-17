import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { Suspense } from "react";
import { PapersWorkspace } from "./_components/papers-workspace";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireUser("admin");

  const subjects = await db
    .select({
      id: schema.subjects.id,
      name: schema.subjects.name,
      specCode: schema.subjects.specCode,
      qualification: schema.subjects.qualification,
    })
    .from(schema.subjects)
    .orderBy(schema.subjects.qualification, schema.subjects.name);

  const rows = await db
    .select({
      id: schema.papers.id,
      subjectId: schema.papers.subjectId,
      subject: schema.subjects.name,
      specCode: schema.subjects.specCode,
      paperCode: schema.papers.paperCode,
      series: schema.papers.series,
      year: schema.papers.year,
      tier: schema.papers.tier,
      status: schema.papers.status,
      statusReason: schema.papers.statusReason,
      pageCount: schema.papers.pageCount,
      originalFilename: schema.papers.originalFilename,
      createdAt: schema.papers.createdAt,
      questionCount: sql<number>`(select count(*)::int from ${schema.questions} q where q.paper_id = ${schema.papers.id})`,
    })
    .from(schema.papers)
    .innerJoin(schema.subjects, eq(schema.subjects.id, schema.papers.subjectId))
    .orderBy(desc(schema.papers.year), schema.papers.paperCode, desc(schema.papers.createdAt));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Past papers</h1>
        <p className="text-muted-foreground">
          Upload question papers. Edexcel layouts are split into questions automatically; anything else you mark by hand.
          Every paper waits for your review before teachers can use it.
        </p>
      </div>
      <Suspense>
        <PapersWorkspace subjects={subjects} rows={rows} />
      </Suspense>
    </div>
  );
}
