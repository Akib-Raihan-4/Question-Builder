import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { matchSubject, readCover } from "@/lib/papers/inspect";

export const runtime = "nodejs";
// A hosted processor on a free plan may need ~30-60 s to wake up.
export const maxDuration = 90;

/** Read a PDF's cover page to pre-fill the upload form. Nothing is stored. */
export async function POST(req: Request) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  const cover = await readCover(new Uint8Array(await file.arrayBuffer()));
  if (!cover) return NextResponse.json({ cover: null, subjectId: null });
  const subjects = await db.select({ id: schema.subjects.id, specCode: schema.subjects.specCode }).from(schema.subjects);
  return NextResponse.json({ cover, subjectId: matchSubject(cover.paper_code, subjects)?.id ?? null });
}
