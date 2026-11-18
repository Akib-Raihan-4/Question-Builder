/** Search words from the box: lower-case, at most 6 (same as the server's search). */
export function searchWords(q: string): string[] {
  return [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 6);
}

/** Split text into plain and matching pieces, for <mark>-ing the search words. */
export function splitMatches(text: string, words: string[]): { text: string; match: boolean }[] {
  if (!words.length || !text) return [{ text, match: false }];
  const escaped = [...words].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(re)
    .filter((t) => t !== "")
    .map((t) => ({ text: t, match: words.includes(t.toLowerCase()) }));
}

/**
 * A short piece of the question's text around the first search word (whole words, "…" where cut),
 * or its opening when nothing matches.
 */
export function snippet(text: string | null | undefined, words: string[], max = 160): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const lower = clean.toLowerCase();
  const hit = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0), Infinity);
  let start = hit === Infinity ? 0 : Math.max(0, hit - Math.floor(max / 3));
  let end = Math.min(clean.length, start + max);
  start = Math.max(0, end - max);
  // Don't cut words in half.
  if (start > 0) start = clean.indexOf(" ", start) + 1 || start;
  if (end < clean.length) end = clean.lastIndexOf(" ", end) > start ? clean.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}
