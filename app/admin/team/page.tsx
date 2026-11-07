import Link from "next/link";
import { connection } from "next/server";
import { addAdmin, removeAdmin } from "@/app/admin/actions";
import { AddAdminForm, ConfirmAction } from "@/components/admin";
import { Card, PageTitle, when } from "@/components/admin-ui";
import { Avatar, Badge } from "@/components/ui";
import { listAdmins } from "@/lib/admin";
import { requireSuperAdmin, SUPER_ADMIN_EMAIL } from "@/lib/auth";

export const metadata = { title: "Admins · Admin" };

// Who can open the admin. Only the owner sees this page.
export default async function AdminTeam() {
  await connection();
  const owner = await requireSuperAdmin();
  const admins = await listAdmins();

  return (
    <>
      <PageTitle title="Admins">
        Who can open the admin. As the owner, only you can add or remove them, and only you see this page.
      </PageTitle>

      <Card title="Add an admin">
        <AddAdminForm action={addAdmin} />
        <p className="mt-3 text-sm text-muted">
          They&apos;ll see everything in the admin except this page, as soon as they sign in with that email.
        </p>
      </Card>

      <Card title={`Admins (${admins.length + 1})`} className="mt-6">
        <ul className="divide-y divide-stone-100">
          <li className="flex flex-wrap items-center gap-3 py-3">
            <Avatar name={owner.full_name || SUPER_ADMIN_EMAIL} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{owner.full_name || SUPER_ADMIN_EMAIL}</p>
              <p className="truncate text-sm text-muted">{SUPER_ADMIN_EMAIL}</p>
            </div>
            <Badge tone="ink">Owner</Badge>
          </li>
          {admins.map((admin) => (
            <li key={admin.email} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={admin.name || admin.email} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {admin.accountId ? (
                    <Link href={`/admin/people/${admin.accountId}`} className="hover:underline">
                      {admin.name || admin.email}
                    </Link>
                  ) : (
                    admin.email
                  )}
                </p>
                <p className="truncate text-sm text-muted">
                  {admin.name && `${admin.email} · `}
                  Added {when(admin.created_at)}
                  {!admin.accountId && " · Hasn't signed in yet"}
                </p>
              </div>
              <ConfirmAction
                action={removeAdmin.bind(null, admin.email)}
                label="Remove"
                confirm={`Remove ${admin.name || admin.email}`}
              />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
