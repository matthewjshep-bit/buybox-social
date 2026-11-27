-- What someone likes and says on an agent's link is public by default, under
-- their first name, like anything they do on a home's own page: so it can be
-- answered, hearted and followed. It's done with a public copy, a normal row
-- of public_comments or public_reactions, which the link's row points to (or,
-- for a like, is marked as having). Passes, replies on the link and messages
-- to the agent stay on the link. Nothing done before this is copied.
--
--   comments.public_comment_id   the public copy of this comment, if any.
--   reactions.public_copy        this like has a public copy (public_reactions).
--   public_reactions.share_id    this public like was copied from that link (so
--                                it goes again if they take the like back there).
--   visitors.links_named_noticed_at
--                                when they were told, on a link, that this is
--                                how it works now. Null only for people here
--                                before this (each is told once); anyone new
--                                is told as they join.
alter table comments add column if not exists public_comment_id uuid
  references public_comments (id) on delete set null;
create index if not exists comments_public_copy_idx on comments (public_comment_id)
  where public_comment_id is not null;
alter table reactions add column if not exists public_copy boolean not null default false;
alter table public_reactions add column if not exists share_id uuid references shares (id) on delete set null;
alter table visitors add column if not exists links_named_noticed_at timestamptz;
alter table visitors alter column links_named_noticed_at set default now();
