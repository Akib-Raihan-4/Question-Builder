"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? "Something went wrong");
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
          onClick={() => confirm(`Reject ${name} (${email})? Their account will be deleted.`) && call(`/api/admin/users/${id}`, "DELETE")}
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
      onClick={() =>
        confirm(`Remove ${name} (${email})? This deletes the account${papers ? ` and their ${papers} paper${papers === 1 ? "" : "s"}` : ""}. It can't be undone.`) &&
        call(`/api/admin/users/${id}`, "DELETE")
      }
    >
      Remove
    </Button>
  );
}
