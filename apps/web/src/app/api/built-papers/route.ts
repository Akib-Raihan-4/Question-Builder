import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";
import { getBranding } from "@/lib/branding";

/** Start a new paper. */
export async function POST() {
  const u = await apiUser();
  if (!u.ok) return u.response;
  // Start from the teacher's school name (Your account → School branding).
  const { school } = await getBranding(u.userId);
  const [row] = await db
    .insert(schema.builtPapers)
    .values({ ownerId: u.userId, title: "Untitled paper", headerJson: { timeAllowed: "1 hour", ...(school ? { school } : {}) } })
    .returning({ id: schema.builtPapers.id });
  return NextResponse.json(row, { status: 201 });
}
