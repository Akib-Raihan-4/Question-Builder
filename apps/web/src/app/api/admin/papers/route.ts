import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { createPaper } from "@/lib/papers/create";
import type { Series } from "@/lib/paper-filename";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF file" }, { status: 400 });
  const tier = String(form.get("tier") ?? "");

  const result = await createPaper({
    subjectId: String(form.get("subjectId") ?? ""),
    paperCode: String(form.get("paperCode") ?? ""),
    series: String(form.get("series") ?? "") as Series,
    year: Number(form.get("year")),
    tier: tier === "F" || tier === "H" ? tier : null,
    bytes: new Uint8Array(await file.arrayBuffer()),
    filename: file.name,
    uploadedBy: u.userId,
    autoDetect: form.get("autoDetect") !== "false",
  });
  if (!result.ok) {
    const status = result.code === "duplicate" ? 409 : result.code === "invalid" ? 400 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result, { status: 201 });
}
