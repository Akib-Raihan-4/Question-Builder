/** The subject whose spec code is the longest prefix of the paper code ("WPH13/01" → WPH13). */
export function matchSubject<T extends { specCode: string }>(paperCode: string | null, subjects: T[]): T | null {
  if (!paperCode) return null;
  const code = paperCode.toUpperCase();
  return subjects.filter((s) => code.startsWith(s.specCode.toUpperCase())).sort((a, b) => b.specCode.length - a.specCode.length)[0] ?? null;
}

/** Vercel functions accept request bodies up to ~4.5 MB; keep a little headroom. */
export const MAX_UPLOAD_BYTES = 4.4 * 1024 * 1024;
