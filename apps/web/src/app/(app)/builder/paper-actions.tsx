"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmDialog, toast } from "@/components/feedback";

export function NewPaperButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch("/api/built-papers", { method: "POST" });
        const body = await res.json();
        if (res.ok) router.push(`/builder/${body.id}`);
        else setBusy(false);
      }}
    >
      {busy ? "Creating…" : "New paper"}
    </Button>
  );
}

export function DeletePaperButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive"
      onClick={async () => {
        if (!(await confirmDialog({ title: `Delete “${title}”?`, body: "This can't be undone.", confirmLabel: "Delete", danger: true }))) return;
        const res = await fetch(`/api/built-papers/${id}`, { method: "DELETE" });
        toast(res.ok ? `“${title}” deleted` : "Could not delete this paper", res.ok ? "ok" : "error");
        router.refresh();
      }}
    >
      Delete
    </Button>
  );
}

export function DuplicatePaperButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch(`/api/built-papers/${id}/duplicate`, { method: "POST" });
        setBusy(false);
        if (res.ok) {
          toast("Copy created");
          router.refresh();
        }
        else toast("Could not duplicate this paper", "error");
      }}
    >
      {busy ? "Copying…" : "Duplicate"}
    </Button>
  );
}
