-- Homes brought in one at a time, when someone asks for one by its address
-- (lib/listings/imports.ts). Its facts are saved right away; its photos are
-- then scanned in the background, a few at a time, for what's in them and
-- where, so a tap on a photo can be named ("the kitchen island").

-- One per imported home: where it came from, and whether its photos are done.
create table listing_imports (
  listing_key text primary key references listings (listing_key) on delete cascade,
  source text not null,
  status text not null default 'queued' check (status in ('queued', 'ready')),
  created_at timestamptz not null default now(),
  -- When its facts were last fetched from the source.
  fetched_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table listing_imports enable row level security;

-- One per photo: the queue, and the scan itself. The scan is kept here, apart
-- from `listings.data`, so fetching the home's facts again never loses it; it
-- is copied onto the home's photos as each one finishes.
create table listing_photos (
  listing_key text not null references listings (listing_key) on delete cascade,
  media_key text not null,
  position int not null,
  source_url text not null,
  status text not null default 'queued' check (status in ('queued', 'scanned', 'failed')),
  attempts int not null default 0,
  -- Being scanned until then; taken again after, if it never finished.
  locked_until timestamptz,
  width int,
  height int,
  -- { room, description, elements: [{ label, x, y, w, h, notable, aspect }] }
  scan jsonb,
  scan_version int,
  model text,
  error text,
  created_at timestamptz not null default now(),
  scanned_at timestamptz,
  primary key (listing_key, media_key)
);
create index listing_photos_queue_idx on listing_photos (created_at, listing_key, position) where status = 'queued';
alter table listing_photos enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on listing_imports, listing_photos from anon, authenticated;
  end if;
end
$$;
