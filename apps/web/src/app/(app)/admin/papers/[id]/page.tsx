import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { loadReview } from "@/lib/review/load";
import { ReviewScreen } from "./review-screen";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("admin");
  const data = await loadReview((await params).id);
  if (!data) notFound();
  return <ReviewScreen initial={data} />;
}
