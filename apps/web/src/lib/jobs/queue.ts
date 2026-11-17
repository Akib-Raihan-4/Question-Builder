import { PgBoss } from "pg-boss";

export const SEGMENT_PAPER = "segment-paper";
export const SEGMENT_RETRY_LIMIT = 3;

/** pg-boss wants a direct connection; Neon's "-pooler" host is a transaction pooler. */
function directUrl() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!;
  return url.replace("-pooler.", ".");
}

const g = globalThis as unknown as { bossPromise?: Promise<PgBoss> };

export function getBoss(): Promise<PgBoss> {
  if (!g.bossPromise) {
    g.bossPromise = (async () => {
      const boss = new PgBoss({ connectionString: directUrl(), max: 3 });
      boss.on("error", (err) => console.error("[pg-boss]", err));
      await boss.start();
      await boss.createQueue(SEGMENT_PAPER, {
        retryLimit: SEGMENT_RETRY_LIMIT,
        retryDelay: 15,
        retryBackoff: true,
        expireInSeconds: 300,
      });
      return boss;
    })().catch((err) => {
      g.bossPromise = undefined;
      throw err;
    });
  }
  return g.bossPromise;
}

export async function enqueueSegmentPaper(paperId: string) {
  const boss = await getBoss();
  // singletonKey: never queue the same paper twice at once.
  return boss.send(SEGMENT_PAPER, { paperId }, { singletonKey: paperId });
}
