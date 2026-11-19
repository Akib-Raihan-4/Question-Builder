import type { Watermark } from "@/db/schema";

export type LogoImage = { bytes: Uint8Array; type: "image/png" | "image/jpeg" };

/** What an export prints: the header logo, and the watermark (words or a faded logo). */
export type ExportBranding = {
  logo: LogoImage | null;
  watermark: { text: string | null; logo: LogoImage | null; opacity: number } | null;
};

/** The watermark's words, or null for none / a logo watermark. Shared by preview and export. */
export function watermarkText(w: Watermark, school: string | undefined): string | null {
  if (w.kind === "school") return school?.trim() || null;
  if (w.kind === "text") return w.text?.trim() || null;
  return null;
}

/** How dark the watermark prints (it sits on top of the page, multiplied, so text stays readable). */
export const watermarkOpacity = (w: Pick<Watermark, "strength">) => (w.strength === "medium" ? 0.14 : 0.08);
