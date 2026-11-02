-- A client can choose to share one of their own "Like" comments, anonymously,
-- on the public listing page. Everything else in a share thread stays private.
alter table comments add column shared_publicly boolean not null default false;
create index comments_shared_idx on comments (listing_key, created_at) where shared_publicly;

-- One row per browser per listing, from public pages and share links alike.
create table listing_views (
  listing_key text not null references listings (listing_key) on delete cascade,
  device_token text not null,
  first_seen timestamptz not null default now(),
  primary key (listing_key, device_token)
);

alter table listing_views enable row level security;
