-- Not liking something: a spot in a photo, or one of a home's facts ("the
-- price", which go by the media key 'facts'). The other side of a photo like,
-- in tables of their own so that nothing that counts likes counts these.
-- Someone likes a thing or doesn't, never both: saving one clears the other.

-- On public pages, by a visitor.
create table public_photo_dislikes (
  listing_key text not null references listings (listing_key) on delete cascade,
  visitor_id uuid not null references visitors (id) on delete cascade,
  media_key text not null,
  tag text not null check (char_length(tag) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (listing_key, visitor_id, media_key, tag)
);
create index public_photo_dislikes_listing_idx on public_photo_dislikes (listing_key, created_at);
create index public_photo_dislikes_visitor_idx on public_photo_dislikes (visitor_id, created_at);
alter table public_photo_dislikes enable row level security;

-- On an agent's link, by someone on it. Private to the link: never counted or
-- shown on public pages.
create table photo_dislikes (
  share_id uuid not null,
  listing_key text not null,
  participant_id uuid not null references participants (id) on delete cascade,
  media_key text not null,
  tag text not null check (char_length(tag) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (participant_id, listing_key, media_key, tag),
  foreign key (share_id, listing_key) references share_listings (share_id, listing_key) on delete cascade
);
create index photo_dislikes_share_idx on photo_dislikes (share_id, listing_key);
alter table photo_dislikes enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public_photo_dislikes, photo_dislikes from anon, authenticated;
  end if;
end
$$;
