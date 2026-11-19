/**
 * Pure helpers for mark schemes: link the reader's rows to a paper's questions and parts, and
 * list what's missing. No database here, so it's easy to test.
 */

export type ReaderRow = {
  label: string; // "1(a)(i)"
  question: number;
  part: string | null; // "a(i)", null = whole question
  regions: { page: number; x0: number; y0: number; x1: number; y1: number }[];
};

export type QuestionRef = { id: string; number: number; parts: { id: string; label: string }[] };

export type LinkedRow = ReaderRow & { questionId: string | null; partId: string | null };

/**
 * Same part label → that part. A finer mark-scheme row ("a(i)" when the paper only has part "a")
 * goes to the part it belongs to. A row for a part the paper doesn't have stays unlinked
 * (questionId null) so the admin sees it.
 */
export function linkRows(rows: ReaderRow[], questions: QuestionRef[]): LinkedRow[] {
  const byNumber = new Map(questions.map((q) => [q.number, q]));
  return rows.map((row) => {
    const q = byNumber.get(row.question);
    if (!q) return { ...row, questionId: null, partId: null };
    if (row.part === null) return { ...row, questionId: q.id, partId: null };
    const exact = q.parts.find((p) => p.label === row.part);
    const parent = exact ?? q.parts.find((p) => row.part!.startsWith(`${p.label}(`));
    if (parent) return { ...row, questionId: q.id, partId: parent.id };
    if (!q.parts.length) return { ...row, questionId: q.id, partId: null }; // paper didn't split this question
    return { ...row, questionId: null, partId: null };
  });
}

/** Our part label as printed on papers: "a(ii)" → "(a)(ii)". */
export const printedPart = (label: string) => label.replace(/^([a-z]{1,2})/, "($1)");

export type Coverage = {
  /** "Q3(d)" etc.: parts (or part-less questions) with no mark scheme row. */
  missing: string[];
  /** Row labels that aren't linked to any question/part. */
  unlinked: string[];
};

/**
 * A part is covered by its own row, or by a row for the whole question. A question without
 * parts needs any row for that question.
 */
export function coverage(questions: QuestionRef[], rows: { label: string; questionId: string | null; partId: string | null }[]): Coverage {
  const missing: string[] = [];
  for (const q of questions) {
    const mine = rows.filter((r) => r.questionId === q.id);
    if (!q.parts.length) {
      if (!mine.length) missing.push(`Q${q.number}`);
      continue;
    }
    const whole = mine.some((r) => r.partId === null);
    for (const p of q.parts) if (!whole && !mine.some((r) => r.partId === p.id)) missing.push(`Q${q.number}${printedPart(p.label)}`);
  }
  const unlinked = [...new Set(rows.filter((r) => r.questionId === null).map((r) => r.label))];
  return { missing, unlinked };
}

/** One line for the admin, or null when everything is linked. */
export function coverageSummary(c: Coverage): string | null {
  const bits: string[] = [];
  if (c.missing.length) bits.push(`No mark scheme row for ${c.missing.slice(0, 6).join(", ")}${c.missing.length > 6 ? ` and ${c.missing.length - 6} more` : ""}`);
  if (c.unlinked.length) bits.push(`${c.unlinked.length} row${c.unlinked.length === 1 ? "" : "s"} not matched to a question (${c.unlinked.slice(0, 4).join(", ")})`);
  return bits.length ? `${bits.join(". ")}.` : null;
}
