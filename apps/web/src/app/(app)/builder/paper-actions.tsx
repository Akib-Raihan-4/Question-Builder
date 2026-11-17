"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
        if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
        await fetch(`/api/built-papers/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      Delete
    </Button>
  );
}
