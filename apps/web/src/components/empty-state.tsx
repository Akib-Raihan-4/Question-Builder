import { cn } from "@/lib/utils";

/** A dashed box that says what's missing and what to do next. */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed bg-background/60 px-6 py-10 text-center", className)}>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
