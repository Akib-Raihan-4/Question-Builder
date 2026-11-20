import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { loadBankQuestions } from "@/lib/builder/server";

/** Questions as the builder shows them to the signed-in teacher (with their own boxes). ?ids=a,b */
export async function GET(req: Request) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100);
  if (!ids.length) return NextResponse.json({ questions: [] });
  let questions = await loadBankQuestions({ questionIds: ids }, u.userId);
  if (u.role !== "admin") {
    // Teachers: published papers only.
    const published = new Set(
      (await db.select({ id: schema.papers.id, status: schema.papers.status }).from(schema.papers).where(inArray(schema.papers.id, [...new Set(questions.map((q) => q.paperId))])))
        .filter((p) => p.status === "published")
        .map((p) => p.id),
    );
    questions = questions.filter((q) => published.has(q.paperId));
  }
  return NextResponse.json({ questions });
}
