"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { BRAND_COLORS } from "@/lib/format";
import { invitePerson, newShareToken } from "@/lib/shares";

export type FormState = { error?: string };

// The fields an agent can get wrong on their profile, and what they typed, so a
// mistake says which one and nothing has to be typed again.
export type ContactField = "contactPhone" | "contactEmail";
export type ProfileState = FormState & {
  field?: ContactField;
  values?: { brokerage: string; contactPhone: string; contactEmail: string };
};

const PHOTO_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
  brokerage: z.string().trim().max(80),
  brandColor: z.string().refine((value) => BRAND_COLORS.some((c) => c.value === value)),
  photo: z
    .string()
    .max(200_000)
    .refine((value) => value === "" || PHOTO_PATTERN.test(value)),
});

// A phone for clients: empty, or a real number with its area code. Kept as
// digits only, so the text and call links on a link are built from nothing else.
const contactPhoneSchema = z
  .string()
  .max(30)
  .regex(/^[\d\s().+-]*$/)
  .transform((value) => value.replace(/\D/g, ""))
  .refine((digits) => digits === "" || (digits.length >= 10 && digits.length <= 15));

const contactEmailSchema = z.union([z.literal(""), z.email().max(254)]);

export async function saveProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const agent = await requireAgent();
  const values = {
    brokerage: String(form.get("brokerage") ?? ""),
    contactPhone: String(form.get("contactPhone") ?? "").trim(),
    contactEmail: String(form.get("contactEmail") ?? "").trim().toLowerCase(),
  };
  const parsed = profileSchema.safeParse({
    fullName: form.get("fullName"),
    brokerage: values.brokerage,
    brandColor: form.get("brandColor"),
    photo: form.get("photo") ?? "",
  });
  if (!parsed.success) return { error: "Please add your name and choose a color.", values };
  const phone = contactPhoneSchema.safeParse(values.contactPhone);
  if (!phone.success) {
    return { error: "Please enter a phone number with the area code, or leave it empty.", field: "contactPhone", values };
  }
  const email = contactEmailSchema.safeParse(values.contactEmail);
  if (!email.success) {
    return { error: "Please enter a valid email address, or leave it empty.", field: "contactEmail", values };
  }
  await sql`
    update accounts set
      full_name = ${parsed.data.fullName},
      brokerage = ${parsed.data.brokerage},
      brand_color = ${parsed.data.brandColor},
      photo_data_url = ${parsed.data.photo || null},
      contact_phone = ${phone.data},
      contact_email = ${email.data}
    where id = ${agent.id}`;
  redirect("/dashboard");
}

const shareSchema = z.object({
  listingKeys: z.array(z.string().max(100)).min(1).max(3),
  people: z.array(z.string().trim().max(40)).max(6),
  note: z.string().trim().max(500),
});

// "Jenny", "Jenny & Mike", "Jenny, Mike & Sam".
const namesTogether = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;

export async function createShare(input: {
  listingKeys: string[];
  people: string[];
  note: string;
}): Promise<FormState> {
  const agent = await requireAgent();
  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) return { error: "Pick between 1 and 3 homes." };
  const keys = [...new Set(parsed.data.listingKeys)];

  // Only homes still for sale, the same as adding homes to a link later.
  const found = await sql`
    select listing_key from listings
    where listing_key in ${sql(keys)} and standard_status = 'Active'`;
  if (found.length !== keys.length) return { error: "One of those homes is no longer available." };

  const people = [...new Set(parsed.data.people.filter(Boolean))];

  const shareId = await sql.begin(async (tx) => {
    const [share] = await tx<{ id: string }[]>`
      insert into shares (token, agent_id, client_name, note)
      values (${newShareToken()}, ${agent.id}, ${namesTogether(people).slice(0, 60)}, ${parsed.data.note})
      returning id`;
    // Everyone gets their own link, so what each of them likes is theirs.
    for (const name of people) {
      const token = newShareToken();
      await tx`
        insert into participants (share_id, device_token, first_name, token, invited_at)
        values (${share.id}, ${`invite:${token}`}, ${name}, ${token}, now())`;
    }
    for (const [position, key] of keys.entries()) {
      await tx`
        insert into share_listings (share_id, listing_key, position)
        values (${share.id}, ${key}, ${position})`;
    }
    return share.id;
  });
  redirect(`/dashboard/shares/${shareId}`);
}

const uuid = z.uuid();

// The signed-in agent's own share, or null.
async function ownShare(agentId: string, shareId: string) {
  if (!uuid.safeParse(shareId).success) return null;
  const [share] = await sql<{ id: string }[]>`
    select id from shares where id = ${shareId} and agent_id = ${agentId}`;
  return share ?? null;
}

// Adds someone to a package, with their own link.
export async function addPerson(shareId: string, _: FormState, form: FormData): Promise<FormState> {
  const agent = await requireAgent();
  const name = z.string().trim().min(1).max(40).safeParse(form.get("firstName"));
  if (!name.success) return { error: "Please enter their first name." };
  if (!(await ownShare(agent.id, shareId))) return { error: "We couldn't find that package." };
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from participants where share_id = ${shareId}`;
  if (count >= 25) return { error: "That's as many people as one package can have." };
  await invitePerson(shareId, name.data);
  refresh();
  return {};
}

// A suggested home, added straight to the package.
export async function addSuggestedHome(shareId: string, listingKey: string): Promise<void> {
  await addHomesToShare(shareId, [listingKey]);
}

export async function renameClient(shareId: string, _: FormState, form: FormData): Promise<FormState> {
  const agent = await requireAgent();
  const name = z.string().trim().min(1).max(60).safeParse(form.get("clientName"));
  if (!name.success) return { error: "Please enter a name, up to 60 characters." };
  if (!(await ownShare(agent.id, shareId))) return { error: "We couldn't find that client." };
  await sql`update shares set client_name = ${name.data} where id = ${shareId}`;
  refresh();
  return {};
}

// Takes a home off the client's link, or puts it back. Nothing the client said
// about it is lost: it still shows to the agent and feeds the client's profile.
export async function setHomeRemoved(shareId: string, listingKey: string, removed: boolean): Promise<void> {
  const agent = await requireAgent();
  if (!(await ownShare(agent.id, shareId))) return;
  await sql`
    update share_listings set removed_at = ${removed ? sql`now()` : null}
    where share_id = ${shareId} and listing_key = ${listingKey}`;
  refresh();
}

export async function addHomesToShare(shareId: string, listingKeys: string[]): Promise<FormState> {
  const agent = await requireAgent();
  const keys = z.array(z.string().max(100)).min(1).max(3).safeParse(listingKeys);
  if (!keys.success) return { error: "Pick between 1 and 3 homes." };
  if (!(await ownShare(agent.id, shareId))) return { error: "We couldn't find that client." };
  const unique = [...new Set(keys.data)];
  const found = await sql`
    select listing_key from listings
    where listing_key in ${sql(unique)} and standard_status = 'Active'`;
  if (found.length !== unique.length) return { error: "One of those homes is no longer available." };
  await sql.begin(async (tx) => {
    const [{ next }] = await tx<{ next: number }[]>`
      select coalesce(max(position), -1) + 1 as next from share_listings where share_id = ${shareId}`;
    for (const [offset, key] of unique.entries()) {
      // A home sent before and removed comes back, with its history intact.
      await tx`
        insert into share_listings (share_id, listing_key, position)
        values (${shareId}, ${key}, ${next + offset})
        on conflict (share_id, listing_key) do update set removed_at = null`;
    }
  });
  redirect(`/dashboard/shares/${shareId}`);
}

export async function replyAsAgent(
  shareId: string,
  listingKey: string,
  body: string,
): Promise<FormState> {
  const agent = await requireAgent();
  const text = z.string().trim().min(1).max(1000).safeParse(body);
  if (!text.success || !uuid.safeParse(shareId).success) {
    return { error: "Replies can be up to 1,000 characters." };
  }
  // The join limits this to the signed-in agent's own shares.
  const inserted = await sql`
    insert into comments (share_id, listing_key, agent_id, body)
    select sl.share_id, sl.listing_key, ${agent.id}, ${text.data}
    from share_listings sl join shares s on s.id = sl.share_id
    where sl.share_id = ${shareId} and sl.listing_key = ${listingKey} and s.agent_id = ${agent.id}
    returning id`;
  if (inserted.length === 0) return { error: "We couldn't find that conversation." };
  refresh();
  return {};
}

export async function removeComment(commentId: string): Promise<void> {
  const agent = await requireAgent();
  if (!uuid.safeParse(commentId).success) return;
  await sql`
    delete from comments c using shares s
    where c.id = ${commentId} and s.id = c.share_id and s.agent_id = ${agent.id}`;
  refresh();
}
