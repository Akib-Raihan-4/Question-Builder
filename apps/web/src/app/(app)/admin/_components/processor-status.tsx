"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

/** One line under the upload buttons: is the processor (question finding, mark schemes, Word export) reachable? */
export function ProcessorStatus() {
  const [s, setS] = useState<{ ok: boolean; error?: string; version?: string | null } | null>(null);
  const check = () => {
    setS(null);
    fetch("/api/admin/processor-health")
      .then((r) => r.json())
      .then(setS)
      .catch(() => setS({ ok: false, error: "Couldn't check" }));
  };
  useEffect(check, []);
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 text-xs", s === null ? "text-muted-foreground" : s.ok ? "text-emerald-700" : "text-red-700")} role="status">
      {s === null && <Spinner />}
      {s === null ? "Checking the processor… (it can take up to a minute to wake up)" : s.ok ? `✓ Processor connected${s.version ? ` (reader ${s.version})` : ""}` : `Processor problem: ${s.error}`}
      {s && !s.ok && (
        <button type="button" onClick={check} className="font-medium underline underline-offset-2">
          Check again
        </button>
      )}
    </p>
  );
}
