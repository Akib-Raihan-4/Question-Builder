import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { SearchParams, searchQuestions } from "@/lib/builder/search";

export async function GET(req: Request) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const raw = Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== ""));
  const parsed = SearchParams.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid search" }, { status: 400 });
  return NextResponse.json(await searchQuestions(parsed.data, u.userId));
}
