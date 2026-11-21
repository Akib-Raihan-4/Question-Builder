"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { startNavigation } from "@/components/navigation-progress";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.email({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error) {
        setPending(false);
        return setError(error.message ?? "Sign in failed");
      }
    } catch {
      setPending(false);
      return setError("Couldn't reach the server. Check your connection and try again.");
    }
    // Signed in: keep the button busy until the next page is on screen.
    startNavigation();
    router.replace("/");
    router.refresh();
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" name="password" autoComplete="current-password" required />
            <p className="text-xs">
              <Link href="/forgot-password" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
                Forgot your password?
              </Link>
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
            {pending ? (
              <>
                <Spinner /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
