"use client";

import { useRef, useState } from "react";
import { toast } from "@/components/feedback";
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
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (next: ClientBranding) => {
    setB(next);
    setBranding(next);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/account/branding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ school, watermark: wm }),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast(body.error ?? "Could not save", "error");
    apply(body);
    toast("Branding saved");
  }

  async function upload(file: File) {
    if (file.size > 1024 * 1024) return toast("The logo must be 1 MB or smaller", "error");
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/account/logo", { method: "POST", body: form });
    setUploading(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast(body.error ?? "Could not upload the logo", "error");
    apply(body);
    toast("Logo saved");
  }

  async function removeLogo() {
    const res = await fetch("/api/account/logo", { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast(body.error ?? "Could not remove the logo", "error");
    apply(body);
    if (wm.kind === "logo") setWm({ ...wm, kind: "none" });
    toast("Logo removed");
  }

  const text = watermarkText(wm, school);
  const showLogoMark = wm.kind === "logo" && b.hasLogo;

  return (
    <form onSubmit={save} className="space-y-5">
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
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "Uploading…" : b.hasLogo ? "Replace" : "Upload logo"}
          </Button>
          {b.hasLogo && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={removeLogo}>
              Remove
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

        {/* Small page preview */}
        <div className="relative mt-2 aspect-[210/297] w-36 overflow-hidden rounded border bg-white shadow-sm" aria-hidden>
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
        <p className="text-xs text-muted-foreground">Printed faintly across every page. You can switch it off for a paper in its header.</p>
      </fieldset>

      <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save branding"}</Button>
    </form>
  );
}
