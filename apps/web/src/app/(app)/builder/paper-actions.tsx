"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmDialog, toast } from "@/components/feedback";
import { Spinner } from "@/components/ui/spinner";
import { startNavigation } from "@/components/navigation-progress";

export function NewPaperButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/built-papers", { method: "POST" });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? "Could not create a paper");
          // Stays busy until the builder opens.
          startNavigation();
          router.push(`/builder/${body.id}`);
        } catch (e) {
          setBusy(false);
          toast((e as Error).message === "Failed to fetch" ? "Couldn't reach the server — check your connection" : (e as Error).message, "error");
        }
      }}
    >
      {busy ? (
        <>
          <Spinner /> Creating…
        </>
      ) : (
        "New paper"
      )}
    </Button>
  );
}

export function DeletePaperButton({ id, title, questions }: { id: string; title: string; questions?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive"
      disabled={busy}
      onClick={async () => {
        const ok = await confirmDialog({
          title: `Delete “${title}”?`,
          body: "This can't be undone. The past papers it was built from aren't affected.",
          details: questions != null ? [`Your paper with its ${questions} question${questions === 1 ? "" : "s"}, header and answer-space settings`] : undefined,
          confirmLabel: "Delete paper",
          danger: true,
        });
        if (!ok) return;
        setBusy(true);
        try {
          const res = await fetch(`/api/built-papers/${id}`, { method: "DELETE" });
          toast(res.ok ? `“${title}” deleted` : "Could not delete this paper", res.ok ? "ok" : "error");
          router.refresh();
        } catch {
          toast("Couldn't reach the server — check your connection and try again", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <>
          <Spinner /> Deleting…
        </>
      ) : (
        "Delete"
      )}
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
      {busy ? (
        <>
          <Spinner /> Copying…
        </>
      ) : (
        "Duplicate"
      )}
    </Button>
  );
}
