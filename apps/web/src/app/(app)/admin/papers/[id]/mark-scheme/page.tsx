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
      initial={ms}
    />
  );
}
