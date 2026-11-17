import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth, type Role } from "./auth";

type Ok = { ok: true; userId: string; role: Role };
type Fail = { ok: false; response: NextResponse };

/** API-route gate. Returns a 401/403 response instead of redirecting. */
export async function apiUser(required?: Role): Promise<Ok | Fail> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = ((session.user as { role?: Role }).role ?? "teacher") as Role;
  if (required === "admin" && role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: session.user.id, role };
}
