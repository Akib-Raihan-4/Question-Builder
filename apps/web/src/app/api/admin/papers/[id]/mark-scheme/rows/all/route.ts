import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { linkRows, parseRowLabel } from "@/lib/mark-schemes/link";
import { questionRefs, refreshMarkSchemeStatus } from "@/lib/mark-schemes/server";

const Box = z.object({ page: z.number().int().min(0).max(500), x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() });
const Body = z.object({
  rows: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        marks: z.number().int().min(0).max(200).nullable().optional(),
        boxes: z.array(Box).min(1).max(20),
      }),
    )
    .max(400),
});

const same = (a: z.infer<typeof Box>[], b: { page: number; x0: number; y0: number; x1: number; y1: number }[]) =>
  a.length === b.length && a.every((x, i) => x.page === b[i].page && ["x0", "y0", "x1", "y1"].every((k) => Math.abs(x[k as "x0"] - b[i][k as "x0"]) < 0.5));

/**
 * Save the whole mark scheme as edited in the full editor: every row (label, boxes, marks) in one
 * go. Labels are linked to the paper's questions and parts the same way the reader's are ("1(a)" →
 * Q1 part (a), or Q1 when the paper doesn't split it); a label that names no question stays
 * unmatched for the admin to see. Rows whose boxes, label or marks changed are marked as edited by
 * hand, so reading the mark scheme again keeps them.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("admin");
  if (!u.ok) return u.response;
  const paperId = (await params).id;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid rows" }, { status: 400 });
  const [ms] = await db.select({ id: schema.markSchemes.id }).from(schema.markSchemes).where(eq(schema.markSchemes.paperId, paperId));
  if (!ms) return NextResponse.json({ error: "No mark scheme" }, { status: 404 });

  // One entry per label (boxes given under the same label belong to one row).
  const byLabel = new Map<string, { label: string; marks: number | null | undefined; boxes: z.infer<typeof Box>[] }>();
  for (const r of parsed.data.rows) {
    const label = parseRowLabel(r.label)?.label ?? r.label.trim();
    const row = byLabel.get(label) ?? { label, marks: undefined, boxes: [] };
    row.boxes.push(...r.boxes.map((b) => ({ page: b.page, x0: Math.min(b.x0, b.x1), y0: Math.min(b.y0, b.y1), x1: Math.max(b.x0, b.x1), y1: Math.max(b.y0, b.y1) })));
    if (r.marks !== undefined) row.marks = r.marks;
    byLabel.set(label, row);
  }

  const old = await db.select().from(schema.msRegions).where(eq(schema.msRegions.markSchemeId, ms.id));
  const refs = await questionRefs(paperId);
  const linked = linkRows(
    [...byLabel.values()].map((r) => {
      const p = parseRowLabel(r.label);
      // No question number in the label: question 0 matches nothing, so the row stays unmatched.
      return { label: r.label, question: p?.question ?? 0, part: p?.part ?? null, regions: r.boxes };
    }),
    refs,
  );

  const values = linked.flatMap((r) => {
    const row = byLabel.get(r.label)!;
    const before = old.filter((o) => o.label === r.label).sort((a, b) => a.page - b.page || a.y0 - b.y0);
    const boxes = [...row.boxes].sort((a, b) => a.page - b.page || a.y0 - b.y0);
    const marks = row.marks !== undefined ? row.marks : (before[0]?.marks ?? null);
    const untouched = before.length > 0 && same(boxes, before) && marks === (before[0]?.marks ?? null);
    const edited = untouched ? before.some((o) => o.editedByAdmin) : true;
    // A row the admin linked by hand keeps that link if its label didn't change.
    const keepLink = untouched && before[0].editedByAdmin;
    return boxes.map((b, i) => ({
      markSchemeId: ms.id,
      questionId: keepLink ? before[0].questionId : r.questionId,
      partId: keepLink ? before[0].partId : r.partId,
      label: r.label,
      marks,
      page: b.page,
      x0: b.x0,
      y0: b.y0,
      x1: b.x1,
      y1: b.y1,
      sortOrder: i,
      editedByAdmin: edited,
    }));
  });

  await db.transaction(async (tx) => {
    await tx.delete(schema.msRegions).where(eq(schema.msRegions.markSchemeId, ms.id));
    if (values.length) await tx.insert(schema.msRegions).values(values);
  });
  return NextResponse.json({ ok: true, rows: byLabel.size, summary: await refreshMarkSchemeStatus(paperId) });
}
