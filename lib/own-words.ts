import { sql } from "./db";

// Your own words, changed or taken back, by whoever said them and no one
// else: a comment on a home's page, a comment on an agent's link (or a
// message in a conversation, which is one too), and a post. What was said
// once in two places is one thing to the person who said it: a comment on a
// link that's public too (lib/link-public.ts) changes, or goes, in both, and
// a post's words on each of its homes' conversations go with the post.
// Taking something back takes the replies under it with it, as anywhere.
//
// Each says whether it found the words (and they were the caller's): false
// reads as "that isn't there anymore".

// ——— On a home's page ———

export async function editPublicComment(visitorId: string, id: string, body: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [changed] = await tx<{ id: string }[]>`
      update public_comments set body = ${body}, edited_at = now()
      where id::text = ${id} and visitor_id = ${visitorId}
      returning id`;
    if (!changed) return false;
    // (Where it began on a link, the link's copy says the same.)
    await tx`update comments set body = ${body}, edited_at = now() where public_comment_id = ${changed.id}`;
    return true;
  });
}

export async function deletePublicComment(visitorId: string, id: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    // Held first, so a reply being saved this moment finishes and goes with it.
    const [mine] = await tx<{ id: string }[]>`
      select id from public_comments where id::text = ${id} and visitor_id = ${visitorId} for update`;
    if (!mine) return false;
    // Said on a link first: gone from there too.
    await tx`delete from comments where public_comment_id = ${mine.id}`;
    await tx`delete from public_comments where id = ${mine.id}`;
    return true;
  });
}

// ——— On an agent's link, or in Messages ———

// Theirs: written as the link's agent, or as someone on it by this account.
const yours = (accountId: string) => sql`
  (c.agent_id = ${accountId}
    or c.participant_id in (select p.id from participants p where p.account_id = ${accountId}))`;

// `shareId`: only on this link (the link's own page acts on nothing else).
export async function editLinkComment(accountId: string, id: string, body: string, shareId?: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [changed] = await tx<{ public_comment_id: string | null }[]>`
      update comments c set body = ${body}, edited_at = now()
      where c.id::text = ${id} and ${yours(accountId)}
        ${shareId ? tx`and c.share_id = ${shareId}` : tx``}
      returning c.public_comment_id`;
    if (!changed) return false;
    if (changed.public_comment_id) {
      await tx`update public_comments set body = ${body}, edited_at = now() where id = ${changed.public_comment_id}`;
    }
    return true;
  });
}

export async function deleteLinkComment(accountId: string, id: string, shareId?: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [mine] = await tx<{ id: string; public_comment_id: string | null }[]>`
      select c.id, c.public_comment_id from comments c
      where c.id::text = ${id} and ${yours(accountId)}
        ${shareId ? tx`and c.share_id = ${shareId}` : tx``}
      for update`;
    if (!mine) return false;
    if (mine.public_comment_id) await tx`delete from public_comments where id = ${mine.public_comment_id}`;
    await tx`delete from comments where id = ${mine.id}`;
    return true;
  });
}

// ——— Posts ———

export type PostChange = "ok" | "gone" | "empty";

// New words for a post. Its homes stay as they were; its words on each
// home's conversation change with it (a post that had none says them there
// now, on the homes still for sale; one left with none takes them away).
export async function editPost(visitorId: string, postId: string, body: string): Promise<PostChange> {
  return sql.begin(async (tx): Promise<PostChange> => {
    const [post] = await tx<{ id: string; homes: number }[]>`
      select p.id, (select count(*)::int from post_homes ph where ph.post_id = p.id) as homes
      from posts p where p.id::text = ${postId} and p.visitor_id = ${visitorId}
      for update`;
    if (!post) return "gone";
    if (!body && post.homes === 0) return "empty";
    await tx`update posts set body = ${body}, edited_at = now() where id = ${post.id}`;
    if (!body) {
      await tx`delete from public_comments where post_id = ${post.id}`;
      return "ok";
    }
    await tx`update public_comments set body = ${body}, edited_at = now() where post_id = ${post.id}`;
    await tx`
      insert into public_comments (listing_key, visitor_id, body, posted, post_id, created_at, edited_at)
      select ph.listing_key, ${visitorId}, ${body}, true, ph.post_id, p.created_at, now()
      from post_homes ph join posts p on p.id = ph.post_id join listings l on l.listing_key = ph.listing_key
      where ph.post_id = ${post.id} and l.standard_status = 'Active'
        and not exists (select 1 from public_comments c where c.post_id = ph.post_id and c.listing_key = ph.listing_key)`;
    return "ok";
  });
}

export async function deletePost(visitorId: string, postId: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [post] = await tx<{ id: string }[]>`
      select id from posts where id::text = ${postId} and visitor_id = ${visitorId} for update`;
    if (!post) return false;
    await tx`delete from public_comments where post_id = ${post.id}`;
    await tx`delete from posts where id = ${post.id}`;
    return true;
  });
}
