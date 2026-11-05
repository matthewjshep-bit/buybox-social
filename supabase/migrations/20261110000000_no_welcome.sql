-- Signing up no longer stops to ask "buyer or agent?": the way in decides.
-- The home page's form makes a buyer; "For agents" makes an agent, remembered
-- here by email until their first sign-in, since that happens from an email link.
create table account_intents (
  email text primary key,
  role text not null check (role in ('agent', 'buyer')),
  created_at timestamptz not null default now()
);
alter table account_intents enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on account_intents from anon, authenticated;
  end if;
end
$$;

-- Everyone who signed in before without choosing is a buyer.
update accounts set role = 'buyer' where role is null;
