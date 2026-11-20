import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { loadSourcePaper } from "@/lib/builder/server";

export async function GET(_req: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const data = await loadSourcePaper((await params).paperId, u.role, u.userId);
  return data ? NextResponse.json(data) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
