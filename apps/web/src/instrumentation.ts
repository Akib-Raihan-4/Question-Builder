export async function register() {
  // The job worker runs inside the Next.js server process (Node runtime only).
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.RUN_WORKER !== "false") {
    const { startWorker } = await import("./lib/jobs/worker");
    startWorker().catch((err) => console.error("[worker] failed to start", err));
  }
}
