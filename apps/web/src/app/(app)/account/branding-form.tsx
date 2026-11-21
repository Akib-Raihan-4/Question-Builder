"use client";

import { useRef, useState } from "react";
import { confirmDialog, toast } from "@/components/feedback";
import { Spinner } from "@/components/ui/spinner";
import { logoUrl, setBranding, type ClientBranding } from "@/components/use-branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { watermarkOpacity, watermarkText } from "@/lib/watermark";
import type { Watermark } from "@/db/schema";

const KINDS: { value: Watermark["kind"]; label: string }[] = [
  { value: "none", label: "None" },
  { value: "school", label: "School name" },
  { value: "text", label: "My own text" },
  { value: "logo", label: "Faded logo" },
];

export function BrandingForm({ initial }: { initial: ClientBranding }) {
  const [b, setB] = useState(initial);
  const [school, setSchool] = useState(initial.school);
  const [wm, setWm] = useState<Watermark>(initial.watermark);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Name and watermark are saved with the button; the logo saves as soon as it's chosen.
  const [saved, setSaved] = useState({ school: initial.school, wm: initial.watermark });
  const dirty = school !== saved.school || JSON.stringify(wm) !== JSON.stringify(saved.wm);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (next: ClientBranding) => {
    setB(next);
    setBranding(next);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/account/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school, watermark: wm }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast(body.error ?? "Could not save", "error");
      apply(body);
      setSaved({ school, wm });
      toast("Branding saved");
    } catch {
      toast("Couldn't reach the server — check your connection and try again", "error");
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    if (file.size > 1024 * 1024) return toast("The logo must be 1 MB or smaller", "error");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/account/logo", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast(body.error ?? "Could not upload the logo", "error");
      apply(body);
      toast("Logo saved");
    } catch {
      toast("Couldn't upload the logo — check your connection and try again", "error");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    const ok = await confirmDialog({
      title: "Remove your school logo?",
      body: "Papers you export from now on won't have it. You can upload it again any time.",
      details: wm.kind === "logo" ? ["Your faded-logo watermark is switched off too"] : undefined,
      confirmLabel: "Remove logo",
      danger: true,
    });
    if (!ok) return;
    setRemoving(true);
    try {
      const res = await fetch("/api/account/logo", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast(body.error ?? "Could not remove the logo", "error");
      apply(body);
      if (wm.kind === "logo") setWm({ ...wm, kind: "none" });
      toast("Logo removed");
    } catch {
      toast("Couldn't reach the server — check your connection and try again", "error");
    } finally {
      setRemoving(false);
    }
  }

  const text = watermarkText(wm, school);
  const showLogoMark = wm.kind === "logo" && b.hasLogo;

  return (
    <form onSubmit={save}>
     <div className="grid gap-6 md:grid-cols-[1fr_11rem]">
     <div className="min-w-0 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="school">School name</Label>
        <Input id="school" value={school} maxLength={200} onChange={(e) => setSchool(e.target.value)} placeholder="e.g. Greenfield International School" />
        <p className="text-xs text-muted-foreground">New papers start with this name in their header.</p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Logo</span>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-md border bg-white">
            {b.hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, signed-in image
              <img src={logoUrl(b)} alt="Your school logo" className="max-h-14 max-w-24 object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">No logo</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            aria-label="Choose a logo"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading || removing} onClick={() => fileRef.current?.click()}>
            {uploading ? (
              <>
                <Spinner /> Uploading…
              </>
            ) : b.hasLogo ? (
              "Replace"
            ) : (
              "Upload logo"
            )}
          </Button>
          {b.hasLogo && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={uploading || removing} onClick={removeLogo}>
              {removing ? (
                <>
                  <Spinner /> Removing…
                </>
              ) : (
                "Remove"
              )}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">PNG or JPEG, up to 1 MB. It goes above the title of your papers.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Watermark</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Watermark">
          {KINDS.map((k) => {
            const disabled = k.value === "logo" && !b.hasLogo;
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={wm.kind === k.value}
                disabled={disabled}
                title={disabled ? "Upload a logo first" : undefined}
                onClick={() => setWm({ ...wm, kind: k.value })}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm pointer-coarse:py-1.5",
                  wm.kind === k.value ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                  disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
              >
                {k.label}
              </button>
            );
          })}
        </div>
        {wm.kind === "text" && (
          <Input
            aria-label="Watermark text"
            value={wm.text ?? ""}
            maxLength={60}
            onChange={(e) => setWm({ ...wm, text: e.target.value })}
            placeholder="e.g. CONFIDENTIAL or Mock exam 2026"
          />
        )}
        {wm.kind !== "none" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Strength</span>
            {(["light", "medium"] as const).map((s) => (
              <label key={s} className="flex items-center gap-1">
                <input type="radio" name="strength" checked={wm.strength === s} onChange={() => setWm({ ...wm, strength: s })} />
                {s === "light" ? "Light" : "Medium"}
              </label>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">Printed faintly across every page. You can switch it off for a paper in its header.</p>
      </fieldset>
     </div>

        {/* Live preview of an exported page */}
        <div className="md:pt-1">
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">Preview</div>
        <div className="relative aspect-[210/297] w-40 overflow-hidden rounded border bg-white shadow-sm md:w-full" aria-hidden>
          <div className="space-y-1 p-3">
            {b.hasLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl(b)} alt="" className="mx-auto mb-1 h-4 object-contain" />
            )}
            <div className="mx-auto h-1.5 w-16 rounded bg-zinc-300" />
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="h-1 rounded bg-zinc-200" style={{ width: `${[90, 70, 84, 60, 92, 76][i % 6]}%` }} />
            ))}
          </div>
          {wm.kind !== "none" && (text || showLogoMark) && (
            <div className="absolute inset-0 flex items-center justify-center mix-blend-multiply" style={{ opacity: watermarkOpacity(wm) * 2.5 }}>
              {showLogoMark ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl(b)} alt="" className="w-3/4 object-contain" />
              ) : (
                <span className="-rotate-45 whitespace-nowrap text-sm font-bold uppercase tracking-wide text-zinc-900">{text}</span>
              )}
            </div>
          )}
        </div>
        {school && <p className="mt-1.5 truncate text-center text-xs text-muted-foreground">{school}</p>}
        </div>
     </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={saving || !dirty}>
          {saving ? (
            <>
              <Spinner /> Saving…
            </>
          ) : (
            "Save branding"
          )}
        </Button>
        {dirty && !saving && (
          <>
            <span className="text-sm text-amber-700">You have unsaved changes</span>
            <button
              type="button"
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                setSchool(saved.school);
                setWm(saved.wm);
              }}
            >
              Undo changes
            </button>
          </>
        )}
      </div>
    </form>
  );
}
