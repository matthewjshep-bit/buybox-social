-- Public reactions and comments on listings, open to any visitor. These are kept
-- apart from share threads, which stay private to their link; public pages only
-- ever show anonymous totals from those.
create table visitors (
  id uuid primary key default gen_random_uuid(),
  device_token text not null unique,
  first_name text not null,
  created_at timestamptz not null default now()
);

create table public_reactions (
  listing_key text not null references listings (listing_key) on delete cascade,
  visitor_id uuid not null references visitors (id) on delete cascade,
  reaction text not null check (reaction in ('love', 'maybe', 'pass')),
  updated_at timestamptz not null default now(),
  primary key (listing_key, visitor_id)
);

create table public_comments (
  id uuid primary key default gen_random_uuid(),
  listing_key text not null references listings (listing_key) on delete cascade,
  visitor_id uuid not null references visitors (id) on delete cascade,
  tag text check (tag in ('like', 'dislike')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index public_comments_listing_idx on public_comments (listing_key, created_at);
create index reactions_listing_idx on reactions (listing_key);
create index comments_listing_idx on comments (listing_key);

alter table visitors enable row level security;
alter table public_reactions enable row level security;
alter table public_comments enable row level security;
