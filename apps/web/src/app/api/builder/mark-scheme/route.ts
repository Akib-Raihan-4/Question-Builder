import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { loadBuilderMarkScheme } from "@/lib/mark-schemes/for-builder";

/**
 * Published mark scheme rows for some questions, as the signed-in teacher sees them (their own
 * boxes in place of the shared ones), with each source paper's mark scheme file version.
 * ?ids=a,b → { questions: { [questionId]: rows }, versions: { [paperId]: version } }
 */
export async function GET(req: Request) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100);
  const { rows, files } = await loadBuilderMarkScheme(ids, u.userId);
  return NextResponse.json({
    questions: Object.fromEntries(rows),
    versions: Object.fromEntries([...files].map(([paperId, f]) => [paperId, f.version])),
  });
}
