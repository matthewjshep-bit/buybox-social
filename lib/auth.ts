import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { sql } from "./db";
import { createSupabase, supabaseConfigured } from "./supabase/server";
import { readTestUser } from "./test-sign-in";

export type Role = "agent" | "buyer";

export type Account = {
  id: string;
  email: string;
  full_name: string;
  role: Role | null;
  brokerage: string;
  photo_data_url: string | null;
  brand_color: string;
};

export type Agent = Account & { role: "agent" };

export const DEV_COOKIE = "bb_dev_user";

// Local sign-in with no password. It can never be active alongside real auth.
export const devLoginEnabled =
  !supabaseConfigured && process.env.ALLOW_DEV_LOGIN === "true";

async function getAuthUser(): Promise<{ id: string; email: string } | null> {
  if (supabaseConfigured) {
    const supabase = await createSupabase();
    const { data } = await supabase.auth.getUser();
    if (data.user?.email) return { id: data.user.id, email: data.user.email };
  } else if (devLoginEnabled) {
    const email = (await cookies()).get(DEV_COOKIE)?.value;
    if (email) return { id: `dev:${email}`, email };
  }
  // Signed in with the test password, while that's on (lib/test-sign-in.ts).
  return readTestUser();
}

// Their first name, or "" until they've said it (signed in with just an
// email). Never a stand-in: each page says that in its own words.
export const firstName = (account: Pick<Account, "full_name">) => account.full_name.trim().split(/\s+/)[0] ?? "";

// The signed-in person, if any. Their account is made on their first sign-in,
// as whatever they signed up as: an agent if they came in through "For
// agents", otherwise a buyer, named from the sign-up form if they used it.
export const getCurrentUser = cache(async (): Promise<Account | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  return accountFor(user);
});

// The account for someone just proved to be signed in (by a code, a link, or
// locally), made the first time.
export async function accountFor(user: { id: string; email: string }): Promise<Account> {
  const [existing] = await sql<Account[]>`
    select id, email, full_name, role, brokerage, photo_data_url, brand_color
    from accounts where auth_user_id = ${user.id}`;
  if (existing?.role) return existing;
  const [intent] = await sql<{ role: Role }[]>`
    delete from account_intents where email = ${user.email} returning role`;
  const [signup] = await sql<{ full_name: string; phone: string }[]>`
    select full_name, phone from signups where email = ${user.email}`;
  const [created] = await sql<Account[]>`
    insert into accounts (auth_user_id, email, role, full_name, phone)
    values (${user.id}, ${user.email}, ${intent?.role ?? "buyer"}, ${signup?.full_name ?? ""}, ${signup?.phone ?? ""})
    on conflict (auth_user_id) do update set
      email = excluded.email,
      role = coalesce(accounts.role, excluded.role),
      full_name = coalesce(nullif(accounts.full_name, ''), excluded.full_name),
      phone = coalesce(nullif(accounts.phone, ''), excluded.phone)
    returning id, email, full_name, role, brokerage, photo_data_url, brand_color`;
  return created;
}

// Called once someone has signed in (opening the link proves the email is
// theirs): whether they came in through "For agents". An account that's
// already there becomes an agent's now; a new one is made as one.
export async function claimAgentIntent(email: string) {
  const [intent] = await sql<{ role: Role }[]>`select role from account_intents where email = ${email}`;
  if (intent?.role !== "agent") return false;
  const updated = await sql`update accounts set role = 'agent' where email = ${email} returning id`;
  if (updated.length) await sql`delete from account_intents where email = ${email}`;
  return true;
}

export async function requireUser(): Promise<Account & { role: Role }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { ...user, role: user.role ?? "buyer" };
}

// The site's owner: always an admin, and the only one who can add or remove
// other admins. Signing in proves they own the inbox, so it's safe to name here.
export const SUPER_ADMIN_EMAIL = "matt@shepflips.com";

export const isSuperAdmin = (account: Pick<Account, "email"> | null) =>
  account?.email.toLowerCase() === SUPER_ADMIN_EMAIL;

// Who can open /admin: the owner, and anyone the owner has added.
export const isAdmin = cache(async (account: Pick<Account, "email"> | null) => {
  if (!account) return false;
  if (isSuperAdmin(account)) return true;
  const [row] = await sql`select 1 from admins where email = ${account.email.toLowerCase()}`;
  return Boolean(row);
});

// Signed out goes to sign in; anyone else signed in sees "not found", so the
// admin pages don't show they exist.
export async function requireAdmin(): Promise<Account & { superAdmin: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdmin(user))) notFound();
  return { ...user, superAdmin: isSuperAdmin(user) };
}

export async function requireSuperAdmin(): Promise<Account> {
  const user = await requireAdmin();
  if (!user.superAdmin) notFound();
  return user;
}

export async function requireAgent(): Promise<Agent> {
  const user = await requireUser();
  if (user.role !== "agent") redirect("/");
  return user as Agent;
}
