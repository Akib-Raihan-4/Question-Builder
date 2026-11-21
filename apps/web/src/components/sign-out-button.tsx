"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { startNavigation } from "./navigation-progress";
import { toast } from "./feedback";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(className)}
      disabled={pending}
      aria-busy={pending}
      onClick={async () => {
        setPending(true);
        startNavigation();
        try {
          await authClient.signOut();
        } catch {
          setPending(false);
          return toast("Couldn't sign out — check your connection and try again", "error");
        }
        // A full page load, so nothing of this account stays on screen or in memory.
        window.location.replace("/login");
      }}
    >
      {pending ? (
        <>
          <Spinner /> Signing out…
        </>
      ) : (
        "Sign out"
      )}
    </Button>
  );
}
