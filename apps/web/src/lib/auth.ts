import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const PENDING_MESSAGE = "Your account is waiting for an administrator to approve it. Please try again later.";

export const auth = betterAuth({
  appName: "Papersmith",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Teachers may sign up, but the account stays "pending" (no access) until an admin approves it.
    disableSignUp: false,
    autoSignIn: false,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      // input: false — a sign-up can never choose its own role or approve itself.
      role: { type: "string", required: false, defaultValue: "teacher", input: false },
      status: { type: "string", required: false, defaultValue: "pending", input: false },
    },
  },
  hooks: {
    // Refuse to start a session for an account that hasn't been approved yet.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const email = String((ctx.body as { email?: string } | undefined)?.email ?? "").trim().toLowerCase();
      if (!email) return;
      const [u] = await db.select({ status: schema.user.status }).from(schema.user).where(eq(schema.user.email, email));
      if (u?.status === "pending") throw new APIError("FORBIDDEN", { message: PENDING_MESSAGE });
    }),
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
export type Role = "admin" | "teacher";
export type AccountStatus = "pending" | "active";
