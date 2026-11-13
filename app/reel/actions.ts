"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getReel, REEL_PAGE, type FeedPost } from "@/lib/feed";
import { getPublicIdentity } from "@/lib/public";
import { homesFrom } from "@/lib/reel-from";
import { getTaste } from "@/lib/taste";

const keyList = z.array(z.string().max(100)).max(1000);

// A page's filters as they came: each a short string or nothing. homesFrom
// checks them again against the page, as the page itself does.
const filterList = z
  .object({
    show: z.string().max(20).nullish(),
    about: z.string().max(60).nullish(),
    side: z.string().max(10).nullish(),
  })
  .nullish();

// The next few homes of a feed opened full screen, after the ones shown,
// with the same filter the page had on.
export async function loadOrderedReel(from: string, filters: unknown, shown: string[]): Promise<FeedPost[]> {
  const exclude = keyList.safeParse(shown);
  const checked = filterList.safeParse(filters);
  if (typeof from !== "string" || from.length > 64 || !exclude.success || !checked.success) return [];
  const ordered = await homesFrom(from, checked.data ?? {});
  if (!ordered) return [];
  const skip = new Set(exclude.data);
  const next = ordered.keys.filter((key) => !skip.has(key)).slice(0, REEL_PAGE);
  if (next.length === 0) return [];
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const viewer = account?.role ? account : null;
  const { visitor } = await getPublicIdentity(viewer, device);
  return getReel(viewer, device, await getTaste(visitor?.id), { only: next, limit: next.length });
}
