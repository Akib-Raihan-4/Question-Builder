import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";

/** Copy one of my papers (title, header and questions in the same order). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const id = (await params).id;
  const [bp] = await db
    .select()
    .from(schema.builtPapers)
    .where(and(eq(schema.builtPapers.id, id), eq(schema.builtPapers.ownerId, u.userId)));
  if (!bp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const items = await db
    .select()
    .from(schema.builtPaperItems)
    .where(eq(schema.builtPaperItems.builtPaperId, id))
    .orderBy(asc(schema.builtPaperItems.position));
  const copy = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.builtPapers)
      .values({ ownerId: u.userId, title: `${bp.title} (copy)`.slice(0, 200), headerJson: bp.headerJson })
      .returning({ id: schema.builtPapers.id });
    if (items.length) {
      await tx.insert(schema.builtPaperItems).values(
        items.map((it) => ({ builtPaperId: row.id, position: it.position, questionId: it.questionId, partIds: it.partIds })),
      );
    }
    return row;
  });
  return NextResponse.json(copy, { status: 201 });
}
