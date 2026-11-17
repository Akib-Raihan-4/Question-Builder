import type { ReviewPart, ReviewQuestion, ReviewRegion } from "./types";

export type QuestionIssue = { questionId: string; number: number; message: string };

/** Everything that blocks publishing, per question. Empty list = publishable. */
export function publishIssues(
  questions: ReviewQuestion[],
  parts: ReviewPart[],
  regions: ReviewRegion[],
): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  if (questions.length === 0) {
    issues.push({ questionId: "", number: 0, message: "The paper has no questions" });
  }
  for (const q of questions) {
    const qParts = parts.filter((p) => p.questionId === q.id);
    const add = (message: string) => issues.push({ questionId: q.id, number: q.number, message });
    if (q.totalMarks <= 0) add("Total marks must be more than 0");
    if (qParts.length > 0) {
      const sum = qParts.reduce((s, p) => s + p.marks, 0);
      if (sum !== q.totalMarks) add(`Part marks add up to ${sum}, not ${q.totalMarks}`);
      for (const p of qParts) {
        if (!regions.some((r) => r.ownerType === "part" && r.ownerId === p.id)) add(`Part (${p.label}) has no box`);
      }
    }
    if (!regions.some((r) => r.ownerType === "question" && r.ownerId === q.id)) add("No box on the page");
    // Topics are optional for now (topic tagging is postponed); search by topic comes later.
  }
  return issues;
}
