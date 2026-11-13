-- Following someone: their public self (their profile), by yours. Only ever
-- public: what you see of someone you follow is what anyone sees on their
-- page; following them just brings it to you, in your feed.
create table follows (
  follower_id uuid not null references visitors (id) on delete cascade,
  followed_id uuid not null references visitors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
-- Someone's followers, newest first.
create index follows_followed_idx on follows (followed_id, created_at desc);
alter table follows enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on follows from anon, authenticated;
  end if;
end
$$;
