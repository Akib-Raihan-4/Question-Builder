import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/api-auth";

/** Start a new paper. */
export async function POST() {
  const u = await apiUser();
  if (!u.ok) return u.response;
  const [row] = await db
    .insert(schema.builtPapers)
    .values({ ownerId: u.userId, title: "Untitled paper", headerJson: { timeAllowed: "1 hour" } })
    .returning({ id: schema.builtPapers.id });
  return NextResponse.json(row, { status: 201 });
}
