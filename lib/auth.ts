import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sql } from "./db";
import { createSupabase, supabaseConfigured } from "./supabase/server";

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
    return data.user?.email ? { id: data.user.id, email: data.user.email } : null;
  }
  if (devLoginEnabled) {
    const email = (await cookies()).get(DEV_COOKIE)?.value;
    return email ? { id: `dev:${email}`, email } : null;
  }
  return null;
}

export const firstName = (account: Pick<Account, "full_name">) =>
  account.full_name.trim().split(/\s+/)[0] || "Someone";

// The signed-in person, if any. Their account row is created on first sign-in;
// `role` stays null until they finish sign-up at /welcome.
export const getCurrentUser = cache(async (): Promise<Account | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  const [existing] = await sql<Account[]>`
    select id, email, full_name, role, brokerage, photo_data_url, brand_color
    from accounts where auth_user_id = ${user.id}`;
  if (existing) return existing;
  const [created] = await sql<Account[]>`
    insert into accounts (auth_user_id, email)
    values (${user.id}, ${user.email})
    on conflict (auth_user_id) do update set email = excluded.email
    returning id, email, full_name, role, brokerage, photo_data_url, brand_color`;
  return created;
});

export async function requireUser(): Promise<Account & { role: Role }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role) redirect("/welcome");
  return user as Account & { role: Role };
}

export async function requireAgent(): Promise<Agent> {
  const user = await requireUser();
  if (user.role !== "agent") redirect("/");
  return user as Agent;
}
