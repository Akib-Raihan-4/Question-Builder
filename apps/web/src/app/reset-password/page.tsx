import Link from "next/link";
import { Logo } from "@/components/logo";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const bad = !token || Boolean(error);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Logo className="text-xl" />
          <h1 className="mt-3 text-lg font-semibold">{bad ? "This link doesn't work" : "Choose a new password"}</h1>
          {bad && (
            <p className="mt-1 text-sm text-muted-foreground">
              It may have expired (links last one hour) or been used already.{" "}
              <Link href="/forgot-password" className="text-foreground underline underline-offset-4">Send a new link</Link>.
            </p>
          )}
        </div>
        {!bad && <ResetForm token={token} />}
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-foreground underline underline-offset-4">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
