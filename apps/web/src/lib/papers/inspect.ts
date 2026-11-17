export type CoverDetails = {
  paper_code: string | null;
  series: string | null;
  year: number | null;
  qualification: string | null;
  tier: "F" | "H" | null;
  title: string | null;
};

import { processorFetch } from "@/lib/processor";

/** Paper details read from the cover page by the processor (best effort; fields may be null). */
export async function readCover(pdf: Uint8Array): Promise<CoverDetails | null> {
  try {
    const form = new FormData();
    form.append("file", new Blob([pdf as BlobPart], { type: "application/pdf" }), "paper.pdf");
    const res = await processorFetch("/inspect", { method: "POST", body: form, timeoutMs: 60_000 });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

export { matchSubject } from "./match";
