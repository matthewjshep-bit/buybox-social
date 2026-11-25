import { sql } from "./db";
import { feedHomeOf, type FeedHome, type FeedWho } from "./feed-home";
import type { Listing } from "./listings/types";
import { photoUrl } from "./person-photo";
import { dayOf } from "./profile";

// Posts: what someone says to everyone from their page or their home, about
// no home, one, or several. One card each, on their page and in their
// followers' feeds: their words, then the homes to swipe through. A post
// about homes also left its words on each home's conversation (a public
// comment marked posted), so the home's own thread has it too.

export type PostEntry = {
  kind: "post";
  // "post:<id>", among the feed's entries.
  id: string;
  postId: string;
  at: string;
  day: string;
  who: FeedWho;
  body: string;
  homes: FeedHome[];
};

const nameOr = (name: string, agent: boolean) => name.trim() || (agent ? "An agent" : "A buyer");

type PostRow = {
  id: string;
  visitor_id: string;
  body: string;
  created_at: Date;
  first_name: string;
  is_agent: boolean;
  photo_v: string | null;
};

// These people's posts, newest first. Homes someone has since hidden from
// their profile are left out of a post (a post with none left still shows).
export async function getPostsBy(visitorIds: string[], { most = 40 }: { most?: number } = {}): Promise<PostEntry[]> {
  if (visitorIds.length === 0) return [];
  const rows = await sql<PostRow[]>`
    select p.id, p.visitor_id, p.body, p.created_at, v.first_name,
      coalesce(a.role = 'agent', false) as is_agent, left(md5(a.photo_data_url), 10) as photo_v
    from posts p join visitors v on v.id = p.visitor_id left join accounts a on a.id = v.account_id
    where p.visitor_id in ${sql(visitorIds)}
    order by p.created_at desc
    limit ${most}`;
  if (rows.length === 0) return [];
  const homes = await sql<{ post_id: string; position: number; data: Listing }[]>`
    select ph.post_id, ph.position, l.data
    from post_homes ph join listings l on l.listing_key = ph.listing_key
    where ph.post_id in ${sql(rows.map((row) => row.id))}
      and (l.owner_account_id is null or coalesce((l.data->>'Hidden')::boolean, false) = false)
    order by ph.post_id, ph.position`;
  const byPost = new Map<string, FeedHome[]>();
  for (const home of homes) byPost.set(home.post_id, [...(byPost.get(home.post_id) ?? []), feedHomeOf(home.data)]);
  return rows.map((row) => {
    const at = row.created_at.toISOString();
    return {
      kind: "post",
      id: `post:${row.id}`,
      postId: row.id,
      at,
      day: dayOf(at),
      who: {
        name: nameOr(row.first_name, row.is_agent),
        face: row.first_name,
        profileId: row.visitor_id,
        agent: row.is_agent,
        photo: photoUrl(row.visitor_id, row.photo_v),
      },
      body: row.body,
      homes: byPost.get(row.id) ?? [],
    };
  });
}

// The homes in these posts, each once, in order: what opens full screen.
export const postKeys = (posts: PostEntry[]) => [...new Set(posts.flatMap((post) => post.homes.map((home) => home.key)))];
