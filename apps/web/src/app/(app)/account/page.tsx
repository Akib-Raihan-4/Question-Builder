import { requireUser } from "@/lib/session";
import { ChangePasswordForm } from "./change-password-form";
import { BrandingForm } from "./branding-form";
import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 rounded-xl bg-background ring-1 ring-foreground/10">
      <div className="border-b px-5 py-4">
        <h2 id={`${id}-title`} className="font-medium">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export default async function AccountPage() {
  const { user, role } = await requireUser();
  const branding = await getBranding(user.id);
  return (
    <div className="space-y-6">
      {/* Who you are */}
      <div className="flex items-center gap-4 rounded-xl bg-background p-5 ring-1 ring-foreground/10">
        <span aria-hidden className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
          {initials(user.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{user.name}</h1>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
            {role === "admin" ? "Administrator" : "Teacher"}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
        <nav aria-label="Account sections" className="hidden lg:block">
          <ul className="sticky top-20 space-y-1 text-sm">
            <li>
              <a href="#branding" className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                School branding
              </a>
            </li>
            <li>
              <a href="#password" className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                Password
              </a>
            </li>
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          <Section id="branding" title="School branding" description="Your school name, logo and watermark on the papers you export.">
            <BrandingForm initial={branding} />
          </Section>
          <Section id="password" title="Password" description="You'll stay signed in here; your other devices are signed out.">
            <ChangePasswordForm />
          </Section>
        </div>
      </div>
    </div>
  );
}
