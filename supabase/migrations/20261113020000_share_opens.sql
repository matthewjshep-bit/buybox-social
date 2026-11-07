-- Agents see that a link they sent was opened, and when: one row per device
-- per link, with the name the person gave on it once they have. The device is
-- kept only as a hash, never its token. Clients and public pages never see it.
create table share_opens (
  share_id uuid not null references shares (id) on delete cascade,
  device_hash text not null,
  participant_id uuid references participants (id) on delete set null,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  photos_seen int not null default 0,
  primary key (share_id, device_hash)
);
alter table share_opens enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on share_opens from anon, authenticated;
  end if;
end
$$;
