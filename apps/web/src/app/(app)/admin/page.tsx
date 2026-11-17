import { requireUser } from "@/lib/session";

export default async function AdminPage() {
  await requireUser("admin");
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Past papers</h1>
      <p className="text-muted-foreground">Upload and review comes in Phase 2.</p>
    </div>
  );
}
