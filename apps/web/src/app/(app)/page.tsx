import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewPaperButton } from "./builder/paper-actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { user, role } = await requireUser();
  const [subjects, recent, review, accounts] = await Promise.all([
    db
      .select({
        id: schema.subjects.id,
        name: schema.subjects.name,
        specCode: schema.subjects.specCode,
        qualification: schema.subjects.qualification,
        published: sql<number>`count(${schema.papers.id}) filter (where ${schema.papers.status} = 'published')::int`,
        questions: sql<number>`(select count(*)::int from questions q join papers p on p.id = q.paper_id
          where p.subject_id = ${schema.subjects.id} and p.status = 'published')`,
      })
      .from(schema.subjects)
      .leftJoin(schema.papers, eq(schema.papers.subjectId, schema.subjects.id))
      .where(eq(schema.subjects.board, "edexcel"))
      .groupBy(schema.subjects.id)
      .orderBy(asc(schema.subjects.specCode)),
    db
      .select({
        id: schema.builtPapers.id,
        title: schema.builtPapers.title,
        updatedAt: schema.builtPapers.updatedAt,
        items: sql<number>`(select count(*)::int from built_paper_items i where i.built_paper_id = built_papers.id)`,
        marks: sql<number>`(
          select coalesce(sum(case when jsonb_array_length(i.part_ids) = 0 then q.total_marks
            else (select coalesce(sum(qp.marks), 0) from question_parts qp
                  where qp.id::text in (select jsonb_array_elements_text(i.part_ids))) end), 0)::int
          from built_paper_items i join questions q on q.id = i.question_id
          where i.built_paper_id = built_papers.id)`,
      })
      .from(schema.builtPapers)
      .where(eq(schema.builtPapers.ownerId, user.id))
      .orderBy(desc(schema.builtPapers.updatedAt))
      .limit(6),
    role === "admin"
      ? db.select({ n: sql<number>`count(*)::int` }).from(schema.papers).where(eq(schema.papers.status, "needs_review"))
      : Promise.resolve([{ n: 0 }]),
    role === "admin"
      ? db.select({ n: sql<number>`count(*)::int` }).from(schema.user).where(eq(schema.user.status, "pending"))
      : Promise.resolve([{ n: 0 }]),
  ]);

  // Teachers only see subjects they can build from; admins also see empty ones (to know what to upload).
  const bank = role === "admin" ? subjects : subjects.filter((s) => s.published > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Pick questions from Edexcel past papers and export a clean, renumbered paper."
        actions={<NewPaperButton />}
      />

      {role === "admin" && accounts[0].n > 0 && (
        <Link href="/admin/teachers" className="block rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          {accounts[0].n} teacher account{accounts[0].n === 1 ? " is" : "s are"} waiting for your approval →
        </Link>
      )}
      {role === "admin" && review[0].n > 0 && (
        <Link href="/admin" className="block rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          {review[0].n} past paper{review[0].n === 1 ? " needs" : "s need"} review before teachers can use {review[0].n === 1 ? "it" : "them"} →
        </Link>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Your recent papers</h2>
          {recent.length > 0 && (
            <Link href="/builder" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
              See all →
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <EmptyState title="Nothing yet" action={<NewPaperButton />}>
            Start a paper, then click questions in past papers to add them. Numbers and totals update as you go.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/builder/${p.id}`}
                  className="flex h-full flex-col gap-1 rounded-xl border bg-background px-4 py-3 transition-colors hover:border-foreground/30 hover:bg-muted/40"
                >
                  <span className="truncate font-medium">{p.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {p.items} question{p.items === 1 ? "" : "s"} · {p.marks} mark{p.marks === 1 ? "" : "s"}
                  </span>
                  <span className="mt-auto pt-1 text-xs text-muted-foreground">
                    Edited {p.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Question bank</h2>
        {bank.length === 0 && (
          <EmptyState title="No past papers are ready yet">
            {role === "admin" ? "Upload and publish papers from Past papers." : "Your admin hasn’t published any past papers yet. Check back soon."}
          </EmptyState>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bank.map((s) => (
            <Card key={s.id} size="sm" className={s.published ? "" : "opacity-60"}>
              <CardHeader>
                <CardDescription>{s.specCode}</CardDescription>
                <CardTitle>{s.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {s.published ? `${s.published} paper${s.published === 1 ? "" : "s"} · ${s.questions} questions` : "No papers yet"}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
