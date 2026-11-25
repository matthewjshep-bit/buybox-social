-- A post: something someone says on their page, to everyone, about no home,
-- one home, or several (a card with the homes to swipe through). A post
-- about homes also leaves its words on each home's public conversation, as a
-- comment marked `posted`, tied back to the post.
create table posts (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references visitors (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 1000),
  created_at timestamptz not null default now()
);
create index posts_visitor_idx on posts (visitor_id, created_at desc);
alter table posts enable row level security;

create table post_homes (
  post_id uuid not null references posts (id) on delete cascade,
  listing_key text not null references listings (listing_key) on delete cascade,
  position int not null default 0,
  primary key (post_id, listing_key)
);
alter table post_homes enable row level security;

alter table public_comments add column post_id uuid references posts (id) on delete set null;
create index public_comments_post_idx on public_comments (post_id) where post_id is not null;
