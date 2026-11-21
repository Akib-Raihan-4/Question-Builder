"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmDialog, toast } from "@/components/feedback";

export function AccountActions({
  id,
  name,
  email,
  kind,
  papers = 0,
  role = "teacher",
}: {
  id: string;
  name: string;
  email: string;
  kind: "pending" | "active";
  papers?: number;
  role?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: string) {
    setBusy(true);
    let res: Response;
    try {
      res = await fetch(url, { method });
    } catch {
      setBusy(false);
      return toast("Couldn't reach the server — check your connection and try again", "error");
    }
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) toast(body.error ?? "Something went wrong", "error");
    else if (url.endsWith("/approve")) toast(`${name} can now sign in${body.emailed ? " — we emailed them" : ""}`);
    else toast(`${name}'s account was deleted`);
    router.refresh();
  }

  if (kind === "pending") {
    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => call(`/api/admin/users/${id}/approve`, "POST")}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={busy}
          onClick={async () =>
            (await confirmDialog({
              title: `Reject ${name}?`,
              body: `${email} won't be able to sign in, and the account request is deleted.`,
              confirmLabel: "Reject",
              danger: true,
            })) && call(`/api/admin/users/${id}`, "DELETE")
          }
        >
          Reject
        </Button>
      </div>
    );
  }
  async function resetPassword() {
    const ok = await confirmDialog({
      title: `Give ${name} a temporary password?`,
      body: `Their current password stops working and they're signed out everywhere. You'll see the new password once, to pass on to them.`,
      confirmLabel: "Make temporary password",
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${id}/password`, {
      method: "POST",
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.password)
      return toast(body.error ?? "Something went wrong", "error");
    await confirmDialog({
      title: `New password for ${name}`,
      body: `Give this to ${email} privately. Ask them to change it from “Your account” after signing in. It won't be shown again.`,
      content: <TemporaryPassword value={body.password} />,
      confirmLabel: "Done",
      hideCancel: true,
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {role === "teacher" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={resetPassword}
        >
          Reset password
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={busy}
        onClick={async () =>
          (await confirmDialog({
            title: `Remove ${name}'s account?`,
            body: "They're signed out and can't sign in again. This can't be undone.",
            details: [`The account ${email}`, ...(papers ? [`Their ${papers} paper${papers === 1 ? "" : "s"}`] : []), "Their school branding and own boxes"],
            typeToConfirm: email,
            confirmLabel: "Remove account",
            danger: true,
          })) && call(`/api/admin/users/${id}`, "DELETE")
        }
      >
        Remove
      </Button>
    </div>
  );
}

function TemporaryPassword({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
      <code className="min-w-0 flex-1 select-all break-all px-1 font-mono text-base">
        {value}
      </code>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            toast(
              "Couldn't copy — select the password and copy it instead",
              "error",
            );
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
