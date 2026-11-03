-- Likes on what a photo shows: "the kitchen", "the marble counters". `tag` is
-- one of the photo's own tags; `aspect` is the broad specific it rolls up to
-- (kitchen, yard, ...) for taste and totals, when there is one.

-- On public pages, by a visitor.
create table public_photo_likes (
  listing_key text not null references listings (listing_key) on delete cascade,
  visitor_id uuid not null references visitors (id) on delete cascade,
  media_key text not null,
  tag text not null check (char_length(tag) between 1 and 60),
  aspect text,
  created_at timestamptz not null default now(),
  primary key (listing_key, visitor_id, media_key, tag)
);
create index public_photo_likes_listing_idx on public_photo_likes (listing_key, created_at);
create index public_photo_likes_visitor_idx on public_photo_likes (visitor_id, created_at);
alter table public_photo_likes enable row level security;

-- On an agent's link, by someone on it. Private, like the rest of that thread.
create table photo_likes (
  share_id uuid not null,
  listing_key text not null,
  participant_id uuid not null references participants (id) on delete cascade,
  media_key text not null,
  tag text not null check (char_length(tag) between 1 and 60),
  aspect text,
  created_at timestamptz not null default now(),
  primary key (participant_id, listing_key, media_key, tag),
  foreign key (share_id, listing_key) references share_listings (share_id, listing_key) on delete cascade
);
create index photo_likes_share_idx on photo_likes (share_id, listing_key);
create index photo_likes_listing_idx on photo_likes (listing_key, created_at);
alter table photo_likes enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public_photo_likes, photo_likes from anon, authenticated;
  end if;
end
$$;
