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
}: {
  id: string;
  name: string;
  email: string;
  kind: "pending" | "active";
  papers?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: string) {
    setBusy(true);
    const res = await fetch(url, { method });
    setBusy(false);
    if (!res.ok) toast((await res.json().catch(() => ({}))).error ?? "Something went wrong", "error");
    else if (url.endsWith("/approve")) toast(`${name} can now sign in`);
    else toast(`${name}'s account was deleted`);
    router.refresh();
  }

  if (kind === "pending") {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => call(`/api/admin/users/${id}/approve`, "POST")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={busy}
          onClick={async () => (await confirmDialog({ title: `Reject ${name}?`, body: `${email} won't be able to sign in, and the account request is deleted.`, confirmLabel: "Reject", danger: true })) && call(`/api/admin/users/${id}`, "DELETE")}
        >
          Reject
        </Button>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive"
      disabled={busy}
      onClick={async () =>
        (await confirmDialog({
          title: `Remove ${name}?`,
          body: `This deletes ${email}${papers ? ` and their ${papers} paper${papers === 1 ? "" : "s"}` : ""}. It can't be undone.`,
          confirmLabel: "Remove",
          danger: true,
        })) &&
        call(`/api/admin/users/${id}`, "DELETE")
      }
    >
      Remove
    </Button>
  );
}
