export type CoverDetails = {
  paper_code: string | null;
  series: string | null;
  year: number | null;
  qualification: string | null;
  tier: "F" | "H" | null;
  title: string | null;
};

const processorUrl = () => process.env.PROCESSOR_URL ?? "http://localhost:8000";

/** Paper details read from the cover page by the processor (best effort; fields may be null). */
export async function readCover(pdf: Uint8Array): Promise<CoverDetails | null> {
  try {
    const form = new FormData();
    form.append("file", new Blob([pdf as BlobPart], { type: "application/pdf" }), "paper.pdf");
    const res = await fetch(`${processorUrl()}/inspect`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

/** The subject whose spec code is the longest prefix of the paper code ("WPH13/01" → WPH13). */
export function matchSubject<T extends { specCode: string }>(paperCode: string | null, subjects: T[]): T | null {
  if (!paperCode) return null;
  const code = paperCode.toUpperCase();
  return subjects.filter((s) => code.startsWith(s.specCode.toUpperCase())).sort((a, b) => b.specCode.length - a.specCode.length)[0] ?? null;
}
