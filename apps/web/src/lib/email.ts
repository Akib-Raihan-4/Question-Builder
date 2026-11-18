import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Email through a Gmail account (GMAIL_USER + a Google "app password" in GMAIL_APP_PASSWORD).
 * If they aren't set, nothing is sent and the app carries on (emails are a convenience, never
 * required to use it).
 */
const user = process.env.GMAIL_USER?.trim();
// Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); the spaces aren't part of it.
const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");

let transport: Transporter | null = null;
function mailer() {
  if (!user || !pass) return null;
  transport ??= nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  return transport;
}

export const emailEnabled = () => Boolean(user && pass);

/** The site's public address, for links in emails. */
export function siteUrl(path = "/") {
  let origin = "http://localhost:3000";
  try {
    if (process.env.BETTER_AUTH_URL) origin = new URL(process.env.BETTER_AUTH_URL.trim()).origin;
  } catch {}
  return new URL(path, origin).toString();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Send one email. Returns false (and logs why) instead of throwing, so a mail problem never
 * breaks sign-up or approval.
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  /** Plain paragraphs. */
  lines: string[];
  button?: { label: string; url: string };
}) {
  const m = mailer();
  const to = [opts.to].flat().filter(Boolean);
  if (!m || to.length === 0) {
    console.warn(`[email] not sent (${!m ? "GMAIL_USER / GMAIL_APP_PASSWORD not set" : "no recipient"}): ${opts.subject}`);
    return false;
  }
  const text = [...opts.lines, opts.button ? `${opts.button.label}: ${opts.button.url}` : ""].filter(Boolean).join("\n\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#18181b;max-width:520px">
${opts.lines.map((l) => `<p>${esc(l)}</p>`).join("\n")}
${
  opts.button
    ? `<p><a href="${esc(opts.button.url)}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(opts.button.label)}</a></p>
<p style="font-size:13px;color:#71717a">Or open this link: ${esc(opts.button.url)}</p>`
    : ""
}
<p style="font-size:13px;color:#71717a">— Papersmith</p></div>`;
  try {
    await m.sendMail({ from: { name: "Papersmith", address: user! }, to, subject: opts.subject, text, html });
    return true;
  } catch (e) {
    console.error(`[email] failed: ${opts.subject}:`, (e as Error).message);
    return false;
  }
}

/** Who hears about new sign-ups: ADMIN_EMAIL (comma-separated) if set, else every admin account. */
export async function adminRecipients(): Promise<string[]> {
  const fromEnv = (process.env.ADMIN_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  const admins = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.role, "admin"));
  return admins.map((a) => a.email);
}
