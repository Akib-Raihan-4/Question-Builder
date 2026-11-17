/** Every call to the Python processor goes through here (address + secret key). */
export function processorFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const base = (process.env.PROCESSOR_URL ?? "http://localhost:8000").replace(/\/+$/, "");
  const headers = new Headers(init.headers);
  if (process.env.PROCESSOR_KEY) headers.set("X-Processor-Key", process.env.PROCESSOR_KEY);
  return fetch(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(init.timeoutMs ?? 120_000) });
}
