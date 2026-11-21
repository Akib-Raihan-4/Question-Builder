"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/components/feedback";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const currentPassword = String(form.get("current"));
    const newPassword = String(form.get("new"));
    setError(null);
    if (newPassword !== String(form.get("confirm"))) return setError("The new passwords don't match");
    if (newPassword === currentPassword) return setError("Choose a password different from the current one");
    setPending(true);
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setPending(false);
    if (error) {
      return setError(error.code === "INVALID_PASSWORD" ? "Your current password isn't right" : (error.message ?? "Could not change the password"));
    }
    formEl.reset();
    toast("Password changed");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current">Current password</Label>
        <PasswordInput id="current" name="current" autoComplete="current-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new">New password</Label>
        <PasswordInput id="new" name="new" autoComplete="new-password" required minLength={8} aria-describedby="new-hint" />
        <p id="new-hint" className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>{pending ? <><Spinner /> Saving…</> : "Change password"}</Button>
    </form>
  );
}
