import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { loadReview } from "@/lib/review/load";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const data = await loadReview((await params).id);
  return data ? NextResponse.json(data) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
