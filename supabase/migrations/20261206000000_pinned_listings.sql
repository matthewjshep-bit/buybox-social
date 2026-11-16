-- Listings an agent put on their profile by finding them (by address or MLS
-- number) rather than typing them in: the home stays the one row everyone
-- shares, with whoever listed it still named on it; this only says whose
-- Listings tab it's on.
create table profile_listings (
  account_id uuid not null references accounts (id) on delete cascade,
  listing_key text not null references listings (listing_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, listing_key)
);
alter table profile_listings enable row level security;
