"use client";

import { Select as S } from "@base-ui/react/select";
import { Check, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  /** Small grey text after the label (e.g. "Higher", "12 questions"). */
  hint?: string;
  /** Options with the same group are listed under that heading (e.g. the year). */
  group?: string;
  disabled?: boolean;
};

/**
 * Dropdown used across the app (replaces the browser's own <select> for a consistent look,
 * grouped long lists and touch-sized rows). Keyboard: arrows, type-ahead, Enter, Escape.
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Choose…",
  className,
  popupClassName,
  disabled,
  "aria-label": ariaLabel,
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  popupClassName?: string;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
}) {
  const items = options.map((o) => ({ value: o.value, label: o.label }));
  // Keep the groups in the order they first appear.
  const groups: { name: string | undefined; options: SelectOption[] }[] = [];
  for (const o of options) {
    const g = groups.find((x) => x.name === o.group);
    if (g) g.options.push(o);
    else groups.push({ name: o.group, options: [o] });
  }
  const selected = options.find((o) => o.value === value);

  return (
    <S.Root items={items} value={value || null} onValueChange={(v) => v != null && onValueChange(String(v))} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background pl-2.5 pr-2 text-left text-base sm:text-sm",
          "hover:bg-muted/60 data-[popup-open]:border-ring data-[popup-open]:ring-3 data-[popup-open]:ring-ring/30",
          "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
          "disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-10",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          {selected ? (
            <>
              {selected.label}
              {selected.hint && <span className="text-muted-foreground"> · {selected.hint}</span>}
            </>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <S.Icon className="shrink-0 text-muted-foreground">
          <ChevronsUpDown className="size-4" aria-hidden />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Positioner className="z-[80] outline-none" sideOffset={4} alignItemWithTrigger={false}>
          <S.Popup
            className={cn(
              "min-w-[var(--anchor-width)] max-w-[min(28rem,calc(100vw-1rem))] origin-[var(--transform-origin)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none",
              "transition-[scale,opacity] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              popupClassName,
            )}
          >
            <S.ScrollUpArrow className="flex h-5 w-full items-center justify-center bg-popover text-muted-foreground">
              <ChevronUp className="size-4" aria-hidden />
            </S.ScrollUpArrow>
            <S.List className="nice-scroll max-h-[min(var(--available-height),22rem)] overflow-y-auto p-1">
              {groups.map((g, gi) => {
                const rows = g.options.map((o) => (
                  <S.Item
                    key={o.value}
                    value={o.value}
                    disabled={o.disabled}
                    className={cn(
                      "grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-md py-1.5 pl-2 pr-3 text-sm outline-none select-none pointer-coarse:py-2.5",
                      "data-[highlighted]:bg-muted data-[selected]:font-medium data-[disabled]:opacity-50",
                    )}
                  >
                    <S.ItemIndicator className="col-start-1">
                      <Check className="size-4" aria-hidden />
                    </S.ItemIndicator>
                    <S.ItemText className="col-start-2 truncate">
                      {o.label}
                      {o.hint && <span className="font-normal text-muted-foreground"> · {o.hint}</span>}
                    </S.ItemText>
                  </S.Item>
                ));
                return g.name ? (
                  <S.Group key={g.name} className={cn(gi > 0 && "mt-1 border-t pt-1")}>
                    <S.GroupLabel className="px-2 pb-0.5 pt-1.5 text-xs font-medium text-muted-foreground">{g.name}</S.GroupLabel>
                    {rows}
                  </S.Group>
                ) : (
                  <div key={`g${gi}`}>{rows}</div>
                );
              })}
            </S.List>
            <S.ScrollDownArrow className="flex h-5 w-full items-center justify-center bg-popover text-muted-foreground">
              <ChevronDown className="size-4" aria-hidden />
            </S.ScrollDownArrow>
          </S.Popup>
        </S.Positioner>
      </S.Portal>
    </S.Root>
  );
}
