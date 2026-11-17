import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Logo className="text-xl" />
          <p className="mt-2 text-sm text-muted-foreground">
            Build exam papers from Edexcel International GCSE past papers.
          </p>
        </div>
        <LoginForm />
        <p className="text-center text-xs text-muted-foreground">
          Internal use only. Accounts are created by your administrator.
        </p>
      </div>
    </main>
  );
}
