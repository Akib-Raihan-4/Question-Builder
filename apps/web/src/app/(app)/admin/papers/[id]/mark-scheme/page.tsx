import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { loadReview } from "@/lib/review/load";
import { loadMarkSchemeReview } from "@/lib/mark-schemes/server";
import { MarkSchemeScreen } from "./mark-scheme-screen";

export const dynamic = "force-dynamic";

export default async function MarkSchemePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("admin");
  const id = (await params).id;
  const [data, ms] = await Promise.all([loadReview(id), loadMarkSchemeReview(id)]);
  if (!data) notFound();
  return (
    <MarkSchemeScreen
      paper={{ id: data.paper.id, label: data.paper.label, subject: data.paper.subject, status: data.paper.status }}
      questions={data.questions.map((q) => ({
        id: q.id,
        number: q.number,
        totalMarks: q.totalMarks,
        parts: data.parts.filter((p) => p.questionId === q.id).sort((a, b) => a.sortOrder - b.sortOrder).map((p) => ({ id: p.id, label: p.label, marks: p.marks })),
      }))}
      // The question paper's boxes per question / part, to show each part beside its mark scheme.
      paperRegions={Object.fromEntries(
        [...new Set(data.regions.map((r) => r.ownerId))].map((owner) => [
          owner,
          data.regions
            .filter((r) => r.ownerId === owner)
            .sort((a, b) => a.page - b.page || a.y0 - b.y0)
            .map(({ page, x0, y0, x1, y1 }) => ({ page, x0, y0, x1, y1 })),
        ]),
      )}
      initial={ms}
    />
  );
}
