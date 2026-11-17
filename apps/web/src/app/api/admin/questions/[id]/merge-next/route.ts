import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { mergeWithNext } from "@/lib/review/structure";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const r = await mergeWithNext((await params).id);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status });
}
