import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PaperLayout } from "@/db/schema";
import { processorFetch } from "@/lib/processor";

/** Ask the processor where text, drawings and answer dots are on every page. */
export async function fetchLayout(pdf: Uint8Array): Promise<PaperLayout> {
  const form = new FormData();
  form.append("file", new Blob([pdf as BlobPart], { type: "application/pdf" }), "paper.pdf");
  const res = await processorFetch("/layout", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Processor /layout responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/**
 * Store a paper's page layout. Best effort: without it, "remove answer space" simply leaves that
 * paper's questions as they are, so a failure is logged, not thrown.
 */
export async function saveLayout(paperId: string, pdf: Uint8Array) {
  try {
    const layout = await fetchLayout(pdf);
    await db.update(schema.papers).set({ layout }).where(eq(schema.papers.id, paperId));
    return true;
  } catch (e) {
    console.error(`[layout] ${paperId}: ${(e as Error).message}`);
    return false;
  }
}
