import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { PAPER_CODE_RE } from "@/lib/papers/create";
import { SERIES } from "@/lib/paper-filename";
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

const Patch = z.object({
  subjectId: z.string().uuid(),
  paperCode: z.string().trim().toUpperCase().regex(PAPER_CODE_RE, 'Paper code should look like "4MB1/01" or "WPH13/01"'),
  series: z.enum(SERIES),
  year: z.number().int().min(2000).max(2100),
  tier: z.enum(["F", "H"]).nullable(),
  parserKey: z.enum(["edexcel", "manual"]).optional(),
});

/** Fix a paper's details (subject, code, series, year, tier, how questions are found). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details" }, { status: 400 });
  try {
    const [row] = await db
      .update(schema.papers)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(schema.papers.id, (await params).id))
      .returning({ id: schema.papers.id });
    return row ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") return NextResponse.json({ error: "Another paper already has these details" }, { status: 409 });
    if (code === "23503") return NextResponse.json({ error: "Unknown subject" }, { status: 400 });
    throw err;
  }
}
