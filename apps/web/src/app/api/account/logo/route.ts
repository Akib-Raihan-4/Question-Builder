import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { getBranding, getBrandingRow } from "@/lib/branding";
import { imageInfo } from "@/lib/image-info";
import { deleteObject, getObjectBytes, putFile } from "@/lib/storage";

export const runtime = "nodejs";
const MAX_BYTES = 1024 * 1024;

/** The signed-in teacher's own logo (never anyone else's). */
export async function GET() {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const row = await getBrandingRow(u.userId);
  if (!row?.logoKey) return NextResponse.json({ error: "No logo" }, { status: 404 });
  const bytes = await getObjectBytes(row.logoKey);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": row.logoType === "image/jpeg" ? "image/jpeg" : "image/png",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Upload or replace the logo: PNG or JPEG, up to 1 MB, checked by its contents. */
export async function POST(req: Request) {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Choose an image" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "The logo must be 1 MB or smaller" }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = imageInfo(bytes);
  if (!info) return NextResponse.json({ error: "Use a PNG or JPEG image" }, { status: 400 });
  if (info.width < 16 || info.height < 16 || info.width > 4000 || info.height > 4000) {
    return NextResponse.json({ error: "The logo should be between 16 and 4000 pixels on each side" }, { status: 400 });
  }

  const old = await getBrandingRow(u.userId);
  const key = `branding/${u.userId}/logo-${Date.now()}.${info.type === "image/png" ? "png" : "jpg"}`;
  await putFile(key, bytes, info.type);
  const values = { logoKey: key, logoType: info.type, updatedAt: new Date() };
  await db
    .insert(schema.userBranding)
    .values({ userId: u.userId, ...values })
    .onConflictDoUpdate({ target: schema.userBranding.userId, set: values });
  if (old?.logoKey) await deleteObject(old.logoKey).catch(() => {});
  return NextResponse.json(await getBranding(u.userId));
}

export async function DELETE() {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const row = await getBrandingRow(u.userId);
  if (row?.logoKey) {
    await db
      .update(schema.userBranding)
      .set({
        logoKey: null,
        logoType: null,
        // A logo watermark makes no sense without a logo.
        watermark: row.watermark.kind === "logo" ? { ...row.watermark, kind: "none" } : row.watermark,
        updatedAt: new Date(),
      })
      .where(eq(schema.userBranding.userId, u.userId));
    await deleteObject(row.logoKey).catch(() => {});
  }
  return NextResponse.json(await getBranding(u.userId));
}
