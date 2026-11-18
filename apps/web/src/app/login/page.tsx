import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ pending?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session && (session.user as { status?: string }).status === "active") redirect("/");
  const { pending } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Logo className="text-xl" />
          <p className="mt-2 text-sm text-muted-foreground">
            Build exam papers from Edexcel past papers.
          </p>
        </div>
        {pending && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Your account is waiting for an administrator to approve it.</p>
        )}
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          New teacher? <Link href="/signup" className="text-foreground underline underline-offset-4">Create an account</Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">Internal use only. New accounts need an administrator&apos;s approval.</p>
      </div>
    </main>
  );
}
