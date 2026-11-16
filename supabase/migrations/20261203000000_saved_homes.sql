-- Homes someone saved, to come back to: theirs alone. Nobody else sees what
-- they saved, on their profile or anywhere.
create table saved_homes (
  visitor_id uuid not null references visitors (id) on delete cascade,
  listing_key text not null references listings (listing_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (visitor_id, listing_key)
);
create index saved_homes_recent_idx on saved_homes (visitor_id, created_at desc);
alter table saved_homes enable row level security;
