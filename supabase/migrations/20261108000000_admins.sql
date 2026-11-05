-- Who can open /admin, besides the owner (see SUPER_ADMIN_EMAIL in lib/auth.ts),
-- who is always one. Only the owner can add or remove anyone here.
create table admins (
  email text primary key,
  added_by text not null,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on admins from anon, authenticated;
  end if;
end
$$;
