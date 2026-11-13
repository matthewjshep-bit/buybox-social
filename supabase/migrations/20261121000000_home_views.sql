-- Where someone spent their time on an agent's link: per home, per device, how
-- long it was on their screen (while they were using it) and how many of its
-- photos they looked at. The device is the same hash share_opens keeps, so
-- who it was comes from there. For the agent only: clients and public pages
-- never see it.
create table share_home_views (
  share_id uuid not null,
  listing_key text not null,
  device_hash text not null,
  seconds int not null default 0,
  photos_seen int not null default 0,
  last_at timestamptz not null default now(),
  primary key (share_id, listing_key, device_hash),
  foreign key (share_id, listing_key) references share_listings (share_id, listing_key) on delete cascade
);
alter table share_home_views enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on share_home_views from anon, authenticated;
  end if;
end
$$;
