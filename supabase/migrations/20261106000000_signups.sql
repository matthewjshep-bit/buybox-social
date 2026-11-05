-- The home page's sign-up form asks for a name and phone number along with the
-- email. They're kept here, by email, from the moment the form is sent, before
-- anyone has opened the sign-in link; finishing sign-up copies them onto the
-- account.
create table signups (
  email text primary key,
  full_name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table signups enable row level security;

alter table accounts add column phone text not null default '';

-- Kept out of Supabase's public API, like every other table. No-op without Supabase.
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on signups from anon, authenticated;
  end if;
end
$$;
