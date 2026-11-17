// Usage: npm run user:create -- <email> <password> <admin|teacher> "<Full Name>"
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { auth } from "../src/lib/auth";

async function main() {
  const [email, password, role = "teacher", ...nameParts] = process.argv.slice(2);
  if (!email || !password || !["admin", "teacher"].includes(role)) {
    console.error('Usage: npm run user:create -- <email> <password> <admin|teacher> "<Full Name>"');
    process.exit(1);
  }
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const name = nameParts.join(" ") || email.split("@")[0];
  const ctx = await auth.$context;

  const existing = await ctx.internalAdapter.findUserByEmail(email.toLowerCase());
  if (existing) {
    await db.update(schema.user).set({ role: role as "admin" | "teacher" }).where(eq(schema.user.id, existing.user.id));
    console.log(`User ${email} already exists — role set to ${role}.`);
    process.exit(0);
  }

  const user = await ctx.internalAdapter.createUser(
    { email: email.toLowerCase(), name, emailVerified: true },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  await db.update(schema.user).set({ role: role as "admin" | "teacher" }).where(eq(schema.user.id, user.id));
  console.log(`✓ Created ${role} ${email}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
