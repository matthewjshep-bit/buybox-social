create table agents (
  id uuid primary key default gen_random_uuid(),
  auth_user_id text not null unique,
  email text not null,
  full_name text not null default '',
  brokerage text not null default '',
  photo_data_url text,
  brand_color text not null default '#1F5F5B',
  created_at timestamptz not null default now()
);

-- `data` holds the listing under RESO Data Dictionary field names, exactly as a
-- feed delivers it. See lib/listings/.
create table listings (
  listing_key text primary key,
  standard_status text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table shares (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  agent_id uuid not null references agents (id) on delete cascade,
  client_name text not null default '',
  note text not null default '',
  last_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index shares_agent_id_idx on shares (agent_id, created_at desc);

create table share_listings (
  share_id uuid not null references shares (id) on delete cascade,
  listing_key text not null references listings (listing_key),
  position int not null,
  primary key (share_id, listing_key)
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references shares (id) on delete cascade,
  device_token text not null,
  first_name text not null,
  created_at timestamptz not null default now(),
  unique (share_id, device_token)
);

create table reactions (
  share_id uuid not null,
  listing_key text not null,
  participant_id uuid not null references participants (id) on delete cascade,
  reaction text not null check (reaction in ('love', 'maybe', 'pass')),
  updated_at timestamptz not null default now(),
  primary key (share_id, listing_key, participant_id),
  foreign key (share_id, listing_key) references share_listings (share_id, listing_key) on delete cascade
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null,
  listing_key text not null,
  participant_id uuid references participants (id) on delete cascade,
  agent_id uuid references agents (id) on delete cascade,
  tag text check (tag in ('like', 'dislike')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  check ((participant_id is null) <> (agent_id is null)),
  foreign key (share_id, listing_key) references share_listings (share_id, listing_key) on delete cascade
);
create index comments_thread_idx on comments (share_id, listing_key, created_at);

-- All access goes through the app's server code, which scopes every query to a
-- share token or a signed-in agent. RLS with no policies means Supabase's public
-- API keys can read and write nothing.
alter table agents enable row level security;
alter table listings enable row level security;
alter table shares enable row level security;
alter table share_listings enable row level security;
alter table participants enable row level security;
alter table reactions enable row level security;
alter table comments enable row level security;
