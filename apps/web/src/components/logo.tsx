export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect x="4" y="2.5" width="14" height="19" rx="2" className="fill-primary" />
        <path d="M7.5 7.5h7M7.5 11h7M7.5 14.5h4" className="stroke-primary-foreground" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="18" cy="18" r="4" className="fill-amber-500" />
      </svg>
      Papersmith
    </span>
  );
}
