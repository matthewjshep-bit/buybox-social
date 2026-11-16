-- Listings an agent (or an investor showing their deals) adds themselves: a
-- row in `listings` like any other home (so it can be opened, liked, talked
-- about and sent on a link), marked as theirs. They show on its owner's
-- profile; they aren't in the homes everyone browses or searches.
alter table listings add column if not exists owner_account_id uuid references accounts (id) on delete cascade;
create index if not exists listings_owner_idx on listings (owner_account_id) where owner_account_id is not null;

-- Their photos: each a JPEG made in the browser, kept as a data URL and
-- served by its id (app/listing-photo/[id]).
create table listing_uploads (
  id uuid primary key default gen_random_uuid(),
  listing_key text not null references listings (listing_key) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  data_url text not null check (char_length(data_url) <= 900000),
  width int not null check (width between 1 and 4000),
  height int not null check (height between 1 and 4000),
  created_at timestamptz not null default now()
);
create index listing_uploads_listing_idx on listing_uploads (listing_key);
alter table listing_uploads enable row level security;
