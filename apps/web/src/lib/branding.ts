import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PaperHeader, Watermark } from "@/db/schema";

export { watermarkText };
import { getObjectBytes } from "./storage";
import { watermarkOpacity, watermarkText, type ExportBranding } from "./watermark";

export type Branding = {
  school: string;
  hasLogo: boolean;
  logoType: "image/png" | "image/jpeg" | null;
  watermark: Watermark;
  updatedAt: string | null;
};

const EMPTY: Branding = { school: "", hasLogo: false, logoType: null, watermark: { kind: "none", strength: "light" }, updatedAt: null };

export async function getBrandingRow(userId: string) {
  const [row] = await db.select().from(schema.userBranding).where(eq(schema.userBranding.userId, userId));
  return row ?? null;
}

/** What the browser may see (no storage keys). */
export async function getBranding(userId: string): Promise<Branding> {
  const row = await getBrandingRow(userId);
  if (!row) return EMPTY;
  return {
    school: row.school ?? "",
    hasLogo: Boolean(row.logoKey),
    logoType: (row.logoType as Branding["logoType"]) ?? null,
    watermark: row.watermark,
    updatedAt: row.updatedAt.toISOString(),
  };
}



/** The logo and watermark to print on one of this owner's papers, honouring the paper's switches. */
export async function brandingForExport(ownerId: string, header: PaperHeader): Promise<ExportBranding> {
  const row = await getBrandingRow(ownerId);
  if (!row) return { logo: null, watermark: null };
  const logoBytes = row.logoKey ? await getObjectBytes(row.logoKey).catch(() => null) : null;
  const logo = logoBytes ? { bytes: logoBytes, type: (row.logoType === "image/jpeg" ? "image/jpeg" : "image/png") as "image/png" | "image/jpeg" } : null;

  const w = row.watermark;
  const text = watermarkText(w, header.school || row.school || undefined);
  const wantsLogo = w.kind === "logo" && Boolean(logo);
  const watermark =
    header.showWatermark !== false && (text || wantsLogo)
      ? { text: wantsLogo ? null : text, logo: wantsLogo ? logo : null, opacity: watermarkOpacity(w) }
      : null;
  return { logo: header.showLogo !== false ? logo : null, watermark };
}
