import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { MAX_UPLOAD_BYTES } from "@/lib/papers/match";
import { deleteMarkScheme, loadMarkSchemeReview, saveMarkScheme } from "@/lib/mark-schemes/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** The paper's mark scheme (rows, links, what's missing), or null. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  return NextResponse.json(await loadMarkSchemeReview((await params).id));
}

/** Upload (or replace) the mark scheme PDF; it is read in the background. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const id = (await params).id;
  const [paper] = await db.select({ id: schema.papers.id }).from(schema.papers).where(eq(schema.papers.id, id));
  if (!paper) return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Choose the mark scheme PDF" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "The PDF is larger than 4.4 MB; compress it first" }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "That isn't a PDF" }, { status: 400 });
  await saveMarkScheme(id, bytes, (file as File).name ?? null, u.userId);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  return (await deleteMarkScheme((await params).id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "No mark scheme" }, { status: 404 });
}
