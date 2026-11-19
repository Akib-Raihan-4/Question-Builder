/**
 * Does a subject's spec code cover a paper code? A spec code is a subject ("4MB1", "WPH13") or a
 * single paper of one ("4MB1/02", which also covers its regional "4MB1/02R"). "4MB1" doesn't
 * cover "4MB12/01", and "4MB1/1" doesn't cover "4MB1/12".
 */
export function covers(specCode: string, paperCode: string): boolean {
  const spec = specCode.toUpperCase();
  const code = paperCode.toUpperCase();
  if (!code.startsWith(spec)) return false;
  const rest = code.slice(spec.length);
  if (!rest) return true;
  return spec.includes("/") ? /^[A-Z]/.test(rest) : rest.startsWith("/");
}

/** The subject whose spec code best covers the paper code: a paper's own subject beats the whole subject. */
export function matchSubject<T extends { specCode: string }>(paperCode: string | null, subjects: T[]): T | null {
  if (!paperCode) return null;
  return subjects.filter((s) => covers(s.specCode, paperCode)).sort((a, b) => b.specCode.length - a.specCode.length)[0] ?? null;
}

/**
 * Papers to move after subjects change: only from a subject that covers the paper's code to one
 * that covers it more specifically (adding "4MB1/02" takes Paper 2 and 2R out of "4MB1"). A paper
 * filed by hand under a subject that doesn't cover its code stays put.
 */
export function planMoves(
  subjects: { id: string; specCode: string }[],
  papers: { id: string; code: string; subjectId: string }[],
): { paperId: string; to: string }[] {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const out: { paperId: string; to: string }[] = [];
  for (const p of papers) {
    const best = matchSubject(p.code, subjects);
    const current = byId.get(p.subjectId);
    if (!best || !current || best.id === current.id) continue;
    if (!covers(current.specCode, p.code) || current.specCode.length >= best.specCode.length) continue;
    out.push({ paperId: p.id, to: best.id });
  }
  return out;
}

/** Spec codes admins may enter: a subject ("WPH13") or one paper of it ("4MB1/02"). */
export const SPEC_CODE_RE = /^[0-9A-Z]{3,8}(\/\d{1,2}[A-Z]{0,2})?$/;

/** Vercel functions accept request bodies up to ~4.5 MB; keep a little headroom. */
export const MAX_UPLOAD_BYTES = 4.4 * 1024 * 1024;
