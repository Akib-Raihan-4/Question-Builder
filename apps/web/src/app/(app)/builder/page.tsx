import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { NewPaperButton, DeletePaperButton } from "./paper-actions";

export const dynamic = "force-dynamic";

export default async function MyPapersPage() {
  const { user } = await requireUser();
  const papers = await db
    .select({
      id: schema.builtPapers.id,
      title: schema.builtPapers.title,
      updatedAt: schema.builtPapers.updatedAt,
      items: sql<number>`(select count(*)::int from ${schema.builtPaperItems} i where i.built_paper_id = ${schema.builtPapers.id})`,
    })
    .from(schema.builtPapers)
    .where(eq(schema.builtPapers.ownerId, user.id))
    .orderBy(desc(schema.builtPapers.updatedAt));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My papers</h1>
          <p className="text-muted-foreground">Build a paper by clicking questions in past papers. Numbers and totals update as you go.</p>
        </div>
        <NewPaperButton />
      </div>
      {papers.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          You haven&apos;t built a paper yet. Start one with <span className="font-medium text-foreground">New paper</span>.
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-background">
          {papers.map((p) => (
            <li key={p.id} className="flex items-center gap-4 px-4 py-3">
              <Link href={`/builder/${p.id}`} className="min-w-0 flex-1">
                <div className="truncate font-medium hover:underline">{p.title}</div>
                <div className="text-xs text-muted-foreground">
                  {p.items} question{p.items === 1 ? "" : "s"} · edited {p.updatedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </Link>
              <DeletePaperButton id={p.id} title={p.title} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
