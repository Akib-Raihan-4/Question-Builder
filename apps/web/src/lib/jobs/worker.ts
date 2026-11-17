import { getBoss, SEGMENT_PAPER, SEGMENT_RETRY_LIMIT } from "./queue";
import { runSegmentPaper, setPaperStatus } from "./segment-paper";

const g = globalThis as unknown as { workerStarted?: boolean };

export async function startWorker() {
  if (g.workerStarted) return;
  g.workerStarted = true;
  const boss = await getBoss();
  await boss.work<{ paperId: string }>(SEGMENT_PAPER, { pollingIntervalSeconds: 2 }, async ([job]) => {
    const { paperId } = job.data;
    try {
      const out = await runSegmentPaper(paperId);
      console.log(`[worker] segmented ${paperId}`, out);
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const finalAttempt = job.retryCount >= SEGMENT_RETRY_LIMIT;
      console.error(`[worker] ${paperId} attempt ${job.retryCount + 1} failed: ${msg}`);
      if (finalAttempt) await setPaperStatus(paperId, "failed", `Processing failed: ${msg}`);
      else await setPaperStatus(paperId, "processing", `Retrying after error: ${msg}`);
      throw err;
    }
  });
  console.log("[worker] listening for segment-paper jobs");
}
