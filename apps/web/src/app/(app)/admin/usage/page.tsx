import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/session";
import { mostUsedQuestions } from "@/lib/builder/search";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  await requireUser("admin");
  const [stats] = (
    await db.execute(sql`select
      (select count(*)::int from built_papers) as papers,
      (select count(distinct owner_id)::int from built_papers) as teachers,
      (select count(*)::int from built_paper_items) as picks,
      (select count(*)::int from papers where status = 'published') as published`)
  ).rows as { papers: number; teachers: number; picks: number; published: number }[];
  const top = await mostUsedQuestions(15);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-muted-foreground">How teachers are using the question bank.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Papers built", stats.papers],
            ["Teachers building", stats.teachers],
            ["Questions picked", stats.picks],
            ["Past papers published", stats.published],
          ] as const
        ).map(([label, n]) => (
          <Card key={label} size="sm">
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{n}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Most-used questions</CardTitle>
          <CardDescription>Counted across every teacher&apos;s papers.</CardDescription>
        </CardHeader>
        <CardContent>
          {top.length === 0 ? (
            <p className="text-sm text-muted-foreground">No questions have been used yet.</p>
          ) : (
            <>
            <ol className="divide-y md:hidden">
              {top.map((q, i) => (
                <li key={q.questionId} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <Link href={`/admin/papers/${q.paperId}`} className="min-w-0 flex-1 hover:underline">
                    <span className="font-medium">Q{q.number}</span> · {q.paperCode} {q.series} {q.year}
                    <span className="block text-xs text-muted-foreground">{q.totalMarks} marks</span>
                  </Link>
                  <span className="shrink-0 text-right tabular-nums">{q.uses}×</span>
                </li>
              ))}
            </ol>
            <table className="hidden w-full text-sm md:table">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 font-medium">Question</th>
                  <th className="py-1.5 font-medium">Paper</th>
                  <th className="py-1.5 text-right font-medium">Marks</th>
                  <th className="py-1.5 text-right font-medium">Times used</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {top.map((q) => (
                  <tr key={q.questionId}>
                    <td className="py-1.5 font-medium">Q{q.number}</td>
                    <td className="py-1.5">
                      <Link href={`/admin/papers/${q.paperId}`} className="hover:underline">
                        {q.paperCode} {q.series} {q.year}
                      </Link>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{q.totalMarks}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {q.uses}
                      {q.papers !== q.uses ? ` (${q.papers} papers)` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
