import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { processorFetch } from "@/lib/processor";

export const maxDuration = 90;

/** Can the website reach the processor, and does the key match? (Admins only.) */
export async function GET() {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  try {
    const health = await processorFetch("/health", { timeoutMs: 75_000 });
    if (!health.ok) return NextResponse.json({ ok: false, error: `The processor answered ${health.status}` });
    const { parsers } = await health.json();
    // A keyed endpoint with no file: 422 means the key was accepted (401 is turned into an error).
    const keyed = await processorFetch("/inspect", { method: "POST", timeoutMs: 30_000 });
    if (keyed.status !== 422 && !keyed.ok) return NextResponse.json({ ok: false, error: `The processor answered ${keyed.status}` });
    return NextResponse.json({ ok: true, version: parsers?.edexcel ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
}
