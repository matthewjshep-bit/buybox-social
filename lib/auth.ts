import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { sql } from "./db";
import { createSupabase, supabaseConfigured } from "./supabase/server";
import { readTestUser } from "./test-sign-in";

type Role = "agent" | "buyer";

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

// Who's actually signed in, if anyone. Their account is made when they sign
// in the first time (the code they typed, or the emailed link): an agent's if
// they came in through "For agents", otherwise a buyer's, named from the
// sign-up form if they used it. (Signed in with no account yet, which only a
// hiccup between the two leaves: a buyer's, made here.)
const getSignedInUser = cache(async (): Promise<Account | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  return accountFor(user);
});

// An admin seeing the site as one of its people (from that person's admin
// page): the site is theirs, as they see it, until the admin stops. Only ever
// for someone signed in as an admin: anyone else's cookie does nothing.
export const VIEW_AS_COOKIE = "pc_view_as";
export const getViewAs = cache(async (): Promise<{ as: Account; admin: Account } | null> => {
  const id = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const admin = await getSignedInUser();
  if (!admin || admin.id === id || !(await isAdmin(admin))) return null;
  const [as] = await sql<Account[]>`
    select id, email, full_name, role, brokerage, photo_data_url, brand_color
    from accounts where id = ${id} and role is not null`;
  return as ? { as, admin } : null;
});

// The person the site is for right now: whoever's signed in, or whoever an
// admin is seeing it as.
export const getCurrentUser = cache(
  async (): Promise<Account | null> => (await getViewAs())?.as ?? (await getSignedInUser()),
);

// The account for someone just proved to be signed in (by a code, a link, or
// locally), made the first time: a buyer's, or an agent's when whoever proved
// it asked for that (`role`). An account already there stays what it is.
// (What anyone types before proving an email is theirs, a name or "as an
// agent", counts for half an hour and no longer: anyone can type anyone's
// email, so it only ever shapes an account made, or named, soon after.)
//
// An account the site's owner made for this email ahead of time (the admin
// API: auth_user_id 'invited:' + the email) is theirs at their first sign-in,
// as it is, role and all: proving the inbox is what makes it theirs. Claimed
// in one statement, so two sign-ins at once can't both claim it (the second
// finds it claimed, below, by their id).
export const INVITED_PREFIX = "invited:";

export async function accountFor(user: { id: string; email: string }, role: Role = "buyer"): Promise<Account> {
  // (No sign-in is ever an invitation itself.)
  if (user.id.startsWith(INVITED_PREFIX)) throw new Error("accountFor: not a signed-in user");
  const [existing] = await sql<Account[]>`
    select id, email, full_name, role, brokerage, photo_data_url, brand_color
    from accounts where auth_user_id = ${user.id}`;
  if (existing?.role) return existing;
  if (!existing) {
    const [claimed] = await sql<Account[]>`
      update accounts set auth_user_id = ${user.id}
      where auth_user_id = ${INVITED_PREFIX + user.email.trim().toLowerCase()}
      returning id, email, full_name, role, brokerage, photo_data_url, brand_color`;
    if (claimed?.role) return claimed;
  }
  // A name and phone from a sign-up form, only if just typed.
  const [signup] = await sql<{ full_name: string; phone: string }[]>`
    select full_name, phone from signups
    where email = ${user.email} and updated_at > now() - interval '30 minutes'`;
  const [created] = await sql<Account[]>`
    insert into accounts (auth_user_id, email, role, full_name, phone)
    values (${user.id}, ${user.email}, ${role}, ${signup?.full_name ?? ""}, ${signup?.phone ?? ""})
    on conflict (auth_user_id) do update set
      email = excluded.email,
      role = coalesce(accounts.role, excluded.role),
      full_name = coalesce(nullif(accounts.full_name, ''), excluded.full_name),
      phone = coalesce(nullif(accounts.phone, ''), excluded.phone)
    returning id, email, full_name, role, brokerage, photo_data_url, brand_color`;
  return created;
}

// A name from a sign-up form, for an account that has none yet: only one
// typed in the last half hour, so a stranger can't leave a name waiting for
// whoever owns the email. Gives back the account's name as it is now.
export async function nameFromSignUp(account: Pick<Account, "id" | "email">): Promise<string> {
  await sql`
    update accounts a set full_name = s.full_name from signups s
    where a.id = ${account.id} and a.full_name = '' and s.email = ${account.email.toLowerCase()}
      and s.full_name <> '' and s.updated_at > now() - interval '30 minutes'`;
  const [named] = await sql<{ full_name: string }[]>`select full_name from accounts where id = ${account.id}`;
  return named?.full_name ?? "";
}

// For the emailed sign-in link alone, which carries no word of which form
// asked for it: whether this email asked to sign up as an agent ("For
// agents") in the last half hour. Used up by asking. It only ever decides
// what a brand-new account is: one already there is never changed by it (or
// anyone could turn your account into an agent's by typing your email).
export async function claimAgentIntent(email: string) {
  const [intent] = await sql<{ role: Role; fresh: boolean }[]>`
    delete from account_intents where email = ${email}
    returning role, created_at > now() - interval '30 minutes' as fresh`;
  return intent?.role === "agent" && intent.fresh;
}

// Only a path on this site, so signing in can never send anyone elsewhere.
// (No backslash: a browser reads "/\" as "//", the start of another site.)
export const sitePath = (path: unknown) =>
  typeof path === "string" && /^\/(?!\/)[^\\\u0000-\u001f]*$/.test(path) && path.length <= 300 ? path : null;

// Where to sign in, for someone stopped at a page that takes an account: with
// the page they asked for (proxy.ts notes it on every request as `x-path`),
// so signing in lands them there. `fallback`: the page, if that's missing.
export async function signInPath(fallback?: string) {
  const asked = sitePath((await headers()).get("x-path")) ?? fallback;
  return asked && asked !== "/" && !asked.startsWith("/login") ? `/login?next=${encodeURIComponent(asked)}` : "/login";
}

export async function requireUser(): Promise<Account & { role: Role }> {
  const user = await getCurrentUser();
  if (!user) redirect(await signInPath());
  return { ...user, role: user.role ?? "buyer" };
}

// The site's owner: always an admin, and the only one who can add or remove
// other admins. Signing in proves they own the inbox, so it's safe to name here.
export const SUPER_ADMIN_EMAIL = "matt@shepflips.com";

const isSuperAdmin = (account: Pick<Account, "email"> | null) =>
  account?.email.toLowerCase() === SUPER_ADMIN_EMAIL;

// Who can open /admin: the owner, and anyone the owner has added.
export const isAdmin = cache(async (account: Pick<Account, "email"> | null) => {
  if (!account) return false;
  if (isSuperAdmin(account)) return true;
  const [row] = await sql`select 1 from admins where email = ${account.email.toLowerCase()}`;
  return Boolean(row);
});

// Signed out goes to sign in (and then back to the page asked for); anyone
// else signed in sees "not found", so the admin pages don't show they exist. (Always the admin themselves, even while
// they're seeing the site as someone else.)
export async function requireAdmin(): Promise<Account & { superAdmin: boolean }> {
  const user = await getSignedInUser();
  if (!user) redirect(await signInPath());
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
