-- Porchcard's API (/api/v1): an agent gives their own tools (a CRM,
-- Zapier, Make) a key, and those tools can then do some of what the agent
-- does here, as them: read their clients and links, send homes, answer a
-- client, add and change their own listings. Only ever the agent's own.
--
--   api_keys                 the keys an agent has made. A key is shown to
--                            them once and kept only as its sha256 (`hash`),
--                            so it can be checked but never read back.
--                            `prefix` is its first few characters, so they
--                            can tell their keys apart. A revoked key stays,
--                            marked, and no longer works.
--   api_rate                 how many requests each key has made in each
--                            minute, to hold any one tool to a fair share.
--                            Old minutes are cleared out as it goes.
--   api_idempotency          the answer to a request sent with an
--                            Idempotency-Key, kept a day, so a tool that
--                            sends the same request twice (a retry after a
--                            dropped connection) gets the same answer back
--                            instead of sending the homes twice.
--   api_webhooks             addresses an agent's tools gave to be told when
--                            a client does something (opens a link, likes a
--                            home). `secret` signs what's sent, so the tool
--                            can tell it came from Porchcard. One that keeps
--                            failing is paused (`disabled_at`).
--   api_webhook_deliveries   what happened each time one was sent, newest
--                            kept, for the agent to see.
--
-- Nothing here is read from the browser: row level security is on with no
-- policies, as on every other table, and only the server reaches them.

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  prefix text not null,
  hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_account_idx on api_keys (account_id);
alter table api_keys enable row level security;

create table api_rate (
  key_id uuid references api_keys (id) on delete cascade,
  window_start timestamptz not null,
  n int not null default 0,
  primary key (key_id, window_start)
);
alter table api_rate enable row level security;

create table api_idempotency (
  key_id uuid references api_keys (id) on delete cascade,
  idem_key text not null,
  request_hash text not null,
  status int not null,
  body jsonb not null,
  created_at timestamptz not null default now(),
  primary key (key_id, idem_key)
);
alter table api_idempotency enable row level security;

create table api_webhooks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  url text not null,
  events text[] not null,
  secret text not null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  failures int not null default 0
);
create index api_webhooks_account_idx on api_webhooks (account_id);
alter table api_webhooks enable row level security;

create table api_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references api_webhooks (id) on delete cascade,
  event_id uuid not null,
  event text not null,
  status int,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index api_webhook_deliveries_webhook_idx on api_webhook_deliveries (webhook_id, created_at desc);
alter table api_webhook_deliveries enable row level security;

-- Key hashes and signing secrets are as good as passwords: the roles
-- Supabase hands browsers get no way at them at all, as with admins.
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on api_keys, api_rate, api_idempotency, api_webhooks, api_webhook_deliveries
      from anon, authenticated;
  end if;
end
$$;
