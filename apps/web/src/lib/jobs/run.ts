import { after } from "next/server";
import { runSegmentPaper, setPaperStatus } from "./segment-paper";

/**
 * Find a paper's questions right after the current request has responded.
 *
 * Works on serverless hosting (Vercel keeps the function alive until this finishes, up to the
 * route's maxDuration) and locally, with no always-on worker. If it fails or the function is cut
 * off, the paper shows as failed / stuck in processing and the admin can press Re-run.
 */
export function scheduleSegmentPaper(paperId: string) {
  after(async () => {
    try {
      const out = await runSegmentPaper(paperId);
      console.log(`[segment] ${paperId}`, out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[segment] ${paperId} failed: ${msg}`);
      await setPaperStatus(paperId, "failed", `Processing failed: ${msg}. Use Re-run to try again.`).catch(() => {});
    }
  });
}
