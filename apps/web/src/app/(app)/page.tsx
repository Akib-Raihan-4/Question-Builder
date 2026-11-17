import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Home() {
  const { user, role } = await requireUser();
  const subjects = await db
    .select({
      id: schema.subjects.id,
      name: schema.subjects.name,
      specCode: schema.subjects.specCode,
      qualification: schema.subjects.qualification,
      published: sql<number>`count(${schema.papers.id}) filter (where ${schema.papers.status} = 'published')::int`,
    })
    .from(schema.subjects)
    .leftJoin(schema.papers, eq(schema.papers.subjectId, schema.subjects.id))
    .where(eq(schema.subjects.board, "edexcel"))
    .groupBy(schema.subjects.id)
    .orderBy(asc(schema.subjects.specCode));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="text-muted-foreground">
          Pick questions from Edexcel International GCSE past papers and export a clean, renumbered paper.
        </p>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {subjects.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardDescription>{s.qualification} · {s.specCode}</CardDescription>
              <CardTitle>{s.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {s.published} published paper{s.published === 1 ? "" : "s"}
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="flex gap-4 text-sm">
        <Link href="/builder" className="underline underline-offset-4">Open the builder →</Link>
        {role === "admin" && (
          <Link href="/admin" className="underline underline-offset-4">Manage past papers →</Link>
        )}
      </div>
    </div>
  );
}
