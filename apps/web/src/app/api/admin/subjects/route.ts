import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";

const Body = z.object({
  board: z.enum(["edexcel", "cambridge"]).default("edexcel"),
  qualification: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(80),
  specCode: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{3,8}$/, "Spec code: letters and digits, e.g. WPH13"),
});

/** Add a subject (or an A-level unit) so its papers get their own tab. */
export async function POST(req: Request) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid subject" }, { status: 400 });
  const [row] = await db.insert(schema.subjects).values(parsed.data).onConflictDoNothing().returning();
  if (!row) return NextResponse.json({ error: `${parsed.data.specCode} already exists` }, { status: 409 });
  return NextResponse.json(row, { status: 201 });
}
