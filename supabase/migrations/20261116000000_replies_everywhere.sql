-- Replies on agents' links, as on public pages: one level, under a comment.
alter table comments add column parent_id uuid references comments (id) on delete cascade;
create index comments_parent_idx on comments (parent_id);

-- A reply can answer someone's likes on a home, not just a comment: it's said
-- under that person's line in the comments. One or the other, never both.
alter table public_comments add column reply_to_visitor uuid references visitors (id) on delete cascade;
alter table public_comments add constraint public_comments_reply_one
  check (parent_id is null or reply_to_visitor is null);
create index public_comments_reply_to_idx on public_comments (reply_to_visitor) where reply_to_visitor is not null;

alter table comments add column reply_to_participant uuid references participants (id) on delete cascade;
alter table comments add constraint comments_reply_one
  check (parent_id is null or reply_to_participant is null);
create index comments_reply_to_idx on comments (reply_to_participant) where reply_to_participant is not null;
