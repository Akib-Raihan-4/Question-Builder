import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { AccountActions } from "./account-actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

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
      <PageHeader
        title="Teachers"
        description="Teachers can request an account from the sign-in page. Approve the ones you know; rejecting deletes the account."
      />

      <section className="space-y-2">
        <h2 className="font-medium">Waiting for approval {pending.length > 0 && <Badge className="ml-1 bg-amber-100 text-amber-900">{pending.length}</Badge>}</h2>
        {pending.length === 0 ? (
          <EmptyState title="No account requests right now" className="py-6">New sign-ups appear here for you to approve.</EmptyState>
        ) : (
          <ul className="divide-y rounded-xl border bg-background">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
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
        <ul className="space-y-2 md:hidden">
          {active.map((u) => (
            <li key={u.id} className="flex items-start justify-between gap-3 rounded-xl border bg-background p-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {u.name}
                  {u.id === me.id && <span className="text-muted-foreground"> (you)</span>}
                </div>
                <div className="truncate text-sm text-muted-foreground">{u.email}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{u.role}</Badge>
                  {u.papers} paper{u.papers === 1 ? "" : "s"} · approved {fmt(u.approvedAt)}
                </div>
              </div>
              {u.id !== me.id && <AccountActions id={u.id} name={u.name} email={u.email} kind="active" papers={u.papers} role={u.role} />}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-xl border bg-background md:block">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 text-right font-medium">Papers built</th>
                <th className="px-4 py-2 font-medium">Approved</th>
                <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
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
                    {u.id !== me.id && <AccountActions id={u.id} name={u.name} email={u.email} kind="active" papers={u.papers} role={u.role} />}
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
