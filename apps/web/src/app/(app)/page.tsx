import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewPaperButton } from "./builder/paper-actions";

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
      .select({ id: schema.builtPapers.id, title: schema.builtPapers.title, updatedAt: schema.builtPapers.updatedAt })
      .from(schema.builtPapers)
      .where(eq(schema.builtPapers.ownerId, user.id))
      .orderBy(desc(schema.builtPapers.updatedAt))
      .limit(5),
    role === "admin"
      ? db.select({ n: sql<number>`count(*)::int` }).from(schema.papers).where(eq(schema.papers.status, "needs_review"))
      : Promise.resolve([{ n: 0 }]),
    role === "admin"
      ? db.select({ n: sql<number>`count(*)::int` }).from(schema.user).where(eq(schema.user.status, "pending"))
      : Promise.resolve([{ n: 0 }]),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name.split(" ")[0]}</h1>
          <p className="text-muted-foreground">
            Pick questions from Edexcel International GCSE past papers and export a clean, renumbered paper.
          </p>
        </div>
        <NewPaperButton />
      </div>

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

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Your recent papers</h2>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing yet — start with <span className="font-medium text-foreground">New paper</span>.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-background">
            {recent.map((p) => (
              <li key={p.id}>
                <Link href={`/builder/${p.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/50">
                  <span className="font-medium">{p.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Question bank</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {subjects.map((s) => (
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
