/** Every call to the Python processor goes through here (address + secret key). */
export async function processorFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const configured = process.env.PROCESSOR_URL?.trim();
  if (!configured && process.env.VERCEL) {
    throw new Error("PROCESSOR_URL isn't set on the website (Vercel → Settings → Environment Variables), so the processor can't be reached");
  }
  const base = (configured || "http://localhost:8000").replace(/\/+$/, "");
  const headers = new Headers(init.headers);
  if (process.env.PROCESSOR_KEY) headers.set("X-Processor-Key", process.env.PROCESSOR_KEY);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(init.timeoutMs ?? 120_000) });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    let host = base;
    try {
      host = new URL(base).host;
    } catch {}
    if (err.name === "TimeoutError") throw new Error(`The processor at ${host} didn't answer in time (it may be waking up — try again in a minute)`);
    const code = err.cause?.code ? ` (${err.cause.code})` : "";
    throw new Error(`Couldn't reach the processor at ${host}${code} — check PROCESSOR_URL on the website`);
  }
  if (res.status === 401) {
    throw new Error("The processor refused the request: PROCESSOR_KEY on the website doesn't match the one on the processor");
  }
  return res;
}
