import Link from "next/link";
import { Logo } from "@/components/logo";
import { emailEnabled } from "@/lib/email";
import { ForgotForm } from "./forgot-form";

// Read the email settings on each visit, not once at build time.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Logo className="text-xl" />
          <h1 className="mt-3 text-lg font-semibold">Forgot your password?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {emailEnabled()
              ? "Enter your email and we'll send you a link to choose a new one."
              : "Ask your admin to set a temporary password for you."}
          </p>
        </div>
        {emailEnabled() && <ForgotForm />}
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-foreground underline underline-offset-4">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
