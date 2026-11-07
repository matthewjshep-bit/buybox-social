-- One tap on Send, on any home, opens the phone's share sheet with a link that
-- already exists. Each agent's page holds a link name made here, on the server,
-- before they tap; tapping turns it into a link for that one home. A name never
-- used is no link at all, and is dropped after a day.
create table share_token_pool (
  token text primary key,
  agent_id uuid not null references accounts (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index share_token_pool_agent_idx on share_token_pool (agent_id, created_at);
alter table share_token_pool enable row level security;

-- Links made by Send: the ones that can be taken back while no one has opened them.
alter table shares add column quick boolean not null default false;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on share_token_pool from anon, authenticated;
  end if;
end
$$;
