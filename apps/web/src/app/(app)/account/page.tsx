import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";
import { BrandingForm } from "./branding-form";
import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user, role } = await requireUser();
  const branding = await getBranding(user.id);
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Your account" description={`${user.name} · ${user.email} · ${role}`} />
      <Card id="branding">
        <CardHeader>
          <CardTitle>School branding</CardTitle>
          <CardDescription>Your logo and watermark on the papers you export.</CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingForm initial={branding} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>You&apos;ll stay signed in here; other devices are signed out.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
