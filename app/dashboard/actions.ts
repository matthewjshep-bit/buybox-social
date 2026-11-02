"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { BRAND_COLORS } from "@/lib/format";
import { newShareToken } from "@/lib/shares";

export type FormState = { error?: string };

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

export async function saveProfile(_: FormState, form: FormData): Promise<FormState> {
  const agent = await requireAgent();
  const parsed = profileSchema.safeParse({
    fullName: form.get("fullName"),
    brokerage: form.get("brokerage") ?? "",
    brandColor: form.get("brandColor"),
    photo: form.get("photo") ?? "",
  });
  if (!parsed.success) return { error: "Please add your name and choose a color." };
  await sql`
    update agents set
      full_name = ${parsed.data.fullName},
      brokerage = ${parsed.data.brokerage},
      brand_color = ${parsed.data.brandColor},
      photo_data_url = ${parsed.data.photo || null}
    where id = ${agent.id}`;
  redirect("/dashboard");
}

const shareSchema = z.object({
  listingKeys: z.array(z.string().max(100)).min(1).max(3),
  clientName: z.string().trim().max(60),
  note: z.string().trim().max(500),
});

export async function createShare(input: {
  listingKeys: string[];
  clientName: string;
  note: string;
}): Promise<FormState> {
  const agent = await requireAgent();
  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) return { error: "Pick between 1 and 3 homes." };
  const keys = [...new Set(parsed.data.listingKeys)];

  const found = await sql`select listing_key from listings where listing_key in ${sql(keys)}`;
  if (found.length !== keys.length) return { error: "One of those homes is no longer available." };

  const shareId = await sql.begin(async (tx) => {
    const [share] = await tx<{ id: string }[]>`
      insert into shares (token, agent_id, client_name, note)
      values (${newShareToken()}, ${agent.id}, ${parsed.data.clientName}, ${parsed.data.note})
      returning id`;
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
