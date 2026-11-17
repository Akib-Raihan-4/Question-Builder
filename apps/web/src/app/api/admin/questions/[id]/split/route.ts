import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { splitAtPart } from "@/lib/review/structure";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const { partId } = (await req.json().catch(() => ({}))) as { partId?: string };
  if (!partId) return NextResponse.json({ error: "partId is required" }, { status: 400 });
  const r = await splitAtPart((await params).id, partId);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status });
}
