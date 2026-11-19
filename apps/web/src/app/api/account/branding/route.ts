import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { getBranding } from "@/lib/branding";

export async function GET() {
  const u = await apiUser();
  if (!u.ok) return u.response;
  return NextResponse.json(await getBranding(u.userId));
}

const Body = z.object({
  school: z.string().trim().max(200),
  watermark: z.object({
    kind: z.enum(["none", "school", "text", "logo"]),
    text: z.string().trim().max(60).optional(),
    strength: z.enum(["light", "medium"]),
  }),
});

/** Save school name and watermark choice (the logo has its own route). */
export async function PUT(req: Request) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the school name and watermark" }, { status: 400 });
  const { school, watermark } = parsed.data;
  if (watermark.kind === "text" && !watermark.text) return NextResponse.json({ error: "Type the watermark text" }, { status: 400 });
  const values = { school: school || null, watermark, updatedAt: new Date() };
  await db
    .insert(schema.userBranding)
    .values({ userId: u.userId, ...values })
    .onConflictDoUpdate({ target: schema.userBranding.userId, set: values });
  return NextResponse.json(await getBranding(u.userId));
}
