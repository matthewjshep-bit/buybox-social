"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireSuperAdmin, SUPER_ADMIN_EMAIL, VIEW_AS_COOKIE } from "@/lib/auth";
import { sql } from "@/lib/db";
import { siteOrigin } from "@/lib/site";

// Every action checks for an admin itself: a server action can be called
// directly, not only from the page that shows its button.

export type PersonFormState = { error?: string; saved?: boolean };

export async function updatePerson(id: string, _: PersonFormState, form: FormData): Promise<PersonFormState> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const role = form.get("role");
  if (!name || name.length > 80) return { error: "Please add a name (up to 80 characters)." };
  if (phone.length > 30) return { error: "That phone number is too long." };
  if (role !== null && role !== "" && role !== "buyer" && role !== "agent") return { error: "Choose buyer or agent." };

  const [account] = await sql<{ email: string }[]>`
    update accounts set full_name = ${name}, phone = ${phone},
      role = coalesce(${role || null}::text, role)
    where id::text = ${id}
    returning email`;
  if (!account) {
    const updated = await sql`update signups set full_name = ${name}, phone = ${phone}, updated_at = now() where id::text = ${id}`;
    if (updated.count === 0) return { error: "This person no longer exists." };
  }
  revalidatePath("/admin", "layout");
  return { saved: true };
}

// Only a lead who never signed in: an account has activity worth keeping.
export async function deleteLead(id: string) {
  await requireAdmin();
  await sql`
    delete from signups s where s.id::text = ${id}
      and not exists (select 1 from accounts a where a.email = s.email)`;
  revalidatePath("/admin", "layout");
  redirect("/admin/people?status=lead");
}

// A public comment, with its replies.
export async function deleteComment(id: string) {
  await requireAdmin();
  await sql`delete from public_comments where id::text = ${id}`;
  revalidatePath("/", "layout");
}

// A comment from a private chat that its buyer shared to the home's page: it
// stays in the chat, just no longer shows in public.
export async function hideSharedComment(id: string) {
  await requireAdmin();
  await sql`update comments set shared_publicly = false where id::text = ${id}`;
  revalidatePath("/", "layout");
}

// --- Admins: the owner's alone ---------------------------------------------

export type AdminFormState = { error?: string; added?: string };

export async function addAdmin(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  const owner = await requireSuperAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.email().max(254).safeParse(email).success) return { error: "Please enter a valid email address." };
  if (email === SUPER_ADMIN_EMAIL) return { error: "That's you: as the owner, you're always an admin." };
  await sql`insert into admins (email, added_by) values (${email}, ${owner.email}) on conflict (email) do nothing`;
  revalidatePath("/admin", "layout");
  return { added: email };
}

export async function removeAdmin(email: string) {
  await requireSuperAdmin();
  await sql`delete from admins where email = ${email}`;
  revalidatePath("/admin", "layout");
}

// See the site as one of its people, to check what they see: their home page,
// their profile, their dashboard. Everything done meanwhile is done as them,
// which the bar along the foot of every page says until Stop.
export async function viewAs(accountId: string) {
  const admin = await requireAdmin();
  if (!z.uuid().safeParse(accountId).success || accountId === admin.id) return;
  const [person] = await sql`select 1 from accounts where id = ${accountId} and role is not null`;
  if (!person) return;
  (await cookies()).set(VIEW_AS_COOKIE, accountId, {
    httpOnly: true,
    sameSite: "lax",
    secure: (await siteOrigin()).startsWith("https:"),
    path: "/",
    maxAge: 60 * 60 * 4,
  });
  redirect("/");
}

// Back to being yourself, on the admin page of whoever it was.
export async function stopViewingAs() {
  const jar = await cookies();
  const id = jar.get(VIEW_AS_COOKIE)?.value;
  jar.delete(VIEW_AS_COOKIE);
  redirect(id && z.uuid().safeParse(id).success ? `/admin/people/${id}` : "/admin/people");
}
