-- An agent's own listings on their page: their MLS member ID, matched to each
-- listing's ListAgentMlsId (RESO). Empty until they add it. One page per ID.
alter table accounts add column if not exists mls_agent_id text not null default ''
  check (mls_agent_id ~ '^[A-Za-z0-9-]{0,20}$');
create unique index if not exists accounts_mls_agent_id_key
  on accounts (lower(mls_agent_id)) where mls_agent_id <> '';
create index if not exists listings_list_agent_idx
  on listings (lower(data->>'ListAgentMlsId')) where standard_status = 'Active';
