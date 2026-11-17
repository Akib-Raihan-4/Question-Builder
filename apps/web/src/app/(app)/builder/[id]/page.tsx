import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getBuiltPaper, listSourcePapers } from "@/lib/builder/server";
import { BuilderScreen } from "./builder-screen";

export const dynamic = "force-dynamic";

export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const [paper, sources] = await Promise.all([getBuiltPaper((await params).id, user.id), listSourcePapers()]);
  if (!paper) notFound();
  return <BuilderScreen paper={paper} sources={sources} />;
}
