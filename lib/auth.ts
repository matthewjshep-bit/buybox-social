import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sql } from "./db";
import { createSupabase, supabaseConfigured } from "./supabase/server";

export type Agent = {
  id: string;
  email: string;
  full_name: string;
  brokerage: string;
  photo_data_url: string | null;
  brand_color: string;
};

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

export const getCurrentAgent = cache(async (): Promise<Agent | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  const [agent] = await sql<Agent[]>`
    insert into agents (auth_user_id, email)
    values (${user.id}, ${user.email})
    on conflict (auth_user_id) do update set email = excluded.email
    returning id, email, full_name, brokerage, photo_data_url, brand_color`;
  return agent;
});

export async function requireAgent(): Promise<Agent> {
  const agent = await getCurrentAgent();
  if (!agent) redirect("/login");
  return agent;
}
