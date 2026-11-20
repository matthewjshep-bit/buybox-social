-- The admin API (/api/admin/v1): the site's owner, by a key of their own,
-- can read and change any account, make new ones, and act as any agent on
-- /api/v1 (header Porchcard-Account).
--
--   api_keys.kind   'agent' for an agent's own key (pc_live_…), 'admin' for
--                   the owner's (pc_admin_…). An admin key works only while
--                   its account's email is still the owner's.
--   api_admin_log   every write made with an admin key, on /api/v1 or
--                   /api/admin/v1: which key, what was asked, the account it
--                   was about, and how it went. `account_id` has no foreign
--                   key on purpose, so deleting an account keeps the trail.
--                   Only the path is kept, never the query (it can carry an
--                   email).
--
-- Accounts the owner makes before their person has signed in carry
-- auth_user_id 'invited:' || lower(email); the first sign-in with that email
-- claims the account (lib/auth.ts accountFor). No schema change for that.

alter table api_keys add column if not exists kind text not null default 'agent'
  check (kind in ('agent', 'admin'));

create table api_admin_log (
  id uuid primary key default gen_random_uuid(),
  key_id uuid references api_keys (id) on delete set null,
  method text not null,
  path text not null,
  account_id uuid,
  status int not null,
  created_at timestamptz not null default now()
);
create index api_admin_log_created_idx on api_admin_log (created_at desc);
alter table api_admin_log enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on api_admin_log from anon, authenticated;
  end if;
end
$$;
