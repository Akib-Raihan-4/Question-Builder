import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { SUBJECTS } from "./seed-data";

type TopicSeed = { code: string; name: string; children?: TopicSeed[] };

async function upsertTopics(subjectId: string, nodes: TopicSeed[], parentId: string | null) {
  for (const [i, node] of nodes.entries()) {
    const [row] = await db
      .insert(schema.topics)
      .values({ subjectId, parentId, code: node.code, name: node.name, sortOrder: i })
      .onConflictDoUpdate({
        target: [schema.topics.subjectId, schema.topics.code],
        set: { name: node.name, parentId, sortOrder: i },
      })
      .returning({ id: schema.topics.id });
    if (node.children) await upsertTopics(subjectId, node.children, row.id);
  }
}

async function main() {
  for (const s of SUBJECTS) {
    const [subject] = await db
      .insert(schema.subjects)
      .values({ board: s.board, qualification: s.qualification, name: s.name, specCode: s.specCode })
      .onConflictDoUpdate({
        target: [schema.subjects.board, schema.subjects.specCode],
        set: { name: s.name, qualification: s.qualification },
      })
      .returning({ id: schema.subjects.id });
    await upsertTopics(subject.id, s.topics, null);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.topics)
      .where(and(eq(schema.topics.subjectId, subject.id)));
    console.log(`✓ ${s.board} ${s.specCode} ${s.name} — ${n} topics`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
