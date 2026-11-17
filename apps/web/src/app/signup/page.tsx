import Link from "next/link";
import { Logo } from "@/components/logo";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Logo className="text-xl" />
          <p className="mt-2 text-sm text-muted-foreground">Create a teacher account. An administrator will approve it before you can sign in.</p>
        </div>
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          Already approved? <Link href="/login" className="text-foreground underline underline-offset-4">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
