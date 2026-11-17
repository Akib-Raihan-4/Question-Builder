import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { AccountActions } from "./account-actions";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) => (d ? d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "–");

export default async function TeachersPage() {
  const { user: me } = await requireUser("admin");
  const users = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.user.role,
      status: schema.user.status,
      createdAt: schema.user.createdAt,
      approvedAt: schema.user.approvedAt,
      papers: sql<number>`(select count(*)::int from built_papers b where b.owner_id = "user"."id")`,
    })
    .from(schema.user)
    .orderBy(desc(schema.user.createdAt));
  const pending = users.filter((u) => u.status === "pending");
  const active = users.filter((u) => u.status === "active");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Teachers</h1>
        <p className="text-muted-foreground">
          Teachers can request an account from the sign-in page. Approve the ones you know; rejecting deletes the account.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Waiting for approval {pending.length > 0 && <Badge className="ml-1 bg-amber-100 text-amber-900">{pending.length}</Badge>}</h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No account requests right now.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-background">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-sm text-muted-foreground">{u.email} · requested {fmt(u.createdAt)}</div>
                </div>
                <AccountActions id={u.id} name={u.name} email={u.email} kind="pending" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Active accounts ({active.length})</h2>
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 text-right font-medium">Papers built</th>
                <th className="px-4 py-2 font-medium">Approved</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {active.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 font-medium">{u.name}{u.id === me.id && <span className="text-muted-foreground"> (you)</span>}</td>
                  <td className="px-4 py-2.5">{u.email}</td>
                  <td className="px-4 py-2.5"><Badge variant="secondary">{u.role}</Badge></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{u.papers}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{fmt(u.approvedAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {u.id !== me.id && <AccountActions id={u.id} name={u.name} email={u.email} kind="active" papers={u.papers} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
