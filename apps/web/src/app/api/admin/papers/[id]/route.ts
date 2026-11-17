import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { deletePaper } from "@/lib/papers/create";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const { id } = await params;
  try {
    const found = await deletePaper(id);
    return found ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "This paper is used in a teacher's built paper and can't be deleted." }, { status: 409 });
  }
}
