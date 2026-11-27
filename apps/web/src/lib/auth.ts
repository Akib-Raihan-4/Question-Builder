import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { adminRecipients, sendEmail, siteUrl } from "./email";

/**
 * Only the site's origin is used from BETTER_AUTH_URL. If it carried a path (e.g. pasted as
 * ".../login"), the auth library would serve its routes under that path and every sign-in would
 * 404 — so the path is dropped and the routes are pinned to /api/auth.
 */
function siteOrigin(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return undefined;
  }
}
const ORIGIN = siteOrigin(process.env.BETTER_AUTH_URL);

export const PENDING_MESSAGE = "Your account is waiting for an administrator to approve it. Please try again later.";

export const auth = betterAuth({
  appName: "Papersmith",
  baseURL: ORIGIN,
  basePath: "/api/auth",
  // Sign-in requests are accepted from the site's own address (BETTER_AUTH_URL) and, on Vercel,
  // from this deployment's own URL (preview deployments).
  trustedOrigins: [ORIGIN, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`].filter(
    (x): x is string => Boolean(x),
  ),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
    },
  }),
  // Counted in the database: Vercel runs many short-lived processes, and per-process memory
  // would start every one of them at zero.
  rateLimit: { storage: "database" },
  emailAndPassword: {
    enabled: true,
    // Teachers may sign up, but the account stays "pending" (no access) until an admin approves it.
    disableSignUp: false,
    autoSignIn: false,
    minPasswordLength: 8,
    // "Forgot password?" emails a link that works for an hour; using it signs out every device.
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Papersmith password",
        lines: [
          `Hi ${user.name},`,
          "Someone (hopefully you) asked to reset the password for your Papersmith account. The link works for one hour.",
          "If it wasn't you, ignore this email — your password stays the same.",
        ],
        button: { label: "Choose a new password", url },
      });
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Tell the admin(s) a teacher is waiting for approval.
        after: async (user) => {
          if ((user as { status?: string }).status !== "pending") return;
          await sendEmail({
            to: await adminRecipients(),
            subject: `New teacher waiting for approval: ${user.name}`,
            lines: [`${user.name} (${user.email}) asked for a Papersmith account.`, "Approve or reject it on the Teachers page."],
            button: { label: "Open Teachers", url: siteUrl("/admin/teachers") },
          });
        },
      },
    },
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
