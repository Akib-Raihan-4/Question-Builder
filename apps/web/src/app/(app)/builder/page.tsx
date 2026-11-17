import { requireUser } from "@/lib/session";

export default async function BuilderPage() {
  await requireUser();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Paper builder</h1>
      <p className="text-muted-foreground">The two-pane builder arrives in Phase 6, once papers are published.</p>
    </div>
  );
}
