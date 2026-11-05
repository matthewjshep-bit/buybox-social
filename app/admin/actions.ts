"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireSuperAdmin, SUPER_ADMIN_EMAIL } from "@/lib/auth";
import { sql } from "@/lib/db";

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
