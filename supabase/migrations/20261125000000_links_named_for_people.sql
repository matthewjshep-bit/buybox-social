-- A link is named for the people on it: the people the agent added, in the
-- order they were added, or else whoever joined through it. Nobody types it.
-- shares.client_name stays, but only as a copy the database keeps up to date
-- (share_people_title, below), so the many pages that read it need no join.

alter table participants
  -- The order within one add: people added together share invited_at.
  add column position smallint,
  -- When this place first counted as theirs, signed in (linkOnce): the agent
  -- and their client follow each other the first time, never again.
  add column linked_at timestamptz,
  -- How the agent found them: a typed first name, one of their clients,
  -- someone who follows them, or anyone else on Porchcard.
  add column added_from text check (added_from in ('name', 'client', 'follow', 'search')),
  -- When they were emailed that the agent sent them homes (a record; the
  -- once-a-day limit is agent_reach.notified_at, which removal doesn't reset).
  add column notified_at timestamptz;

-- Who each agent has reached on Porchcard: when they last added them as
-- someone they'd never met (found_at), and when we last emailed them about it
-- (notified_at). Kept apart from participants, so taking someone off a link (or
-- their leaving it) never resets either limit: removing and re-adding someone
-- can't email them again, or reach more strangers in a day.
create table if not exists agent_reach (
  agent_id uuid not null references accounts (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  found_at timestamptz,
  notified_at timestamptz,
  primary key (agent_id, account_id)
);
-- The strangers an agent added in the last day.
create index if not exists agent_reach_found_idx on agent_reach (agent_id, found_at);
alter table agent_reach enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on agent_reach from anon, authenticated;
  end if;
end
$$;

comment on column shares.client_name is
  'Derived: who the link is for (share_people_title). Kept by the participants_retitle trigger; never written by the app.';

-- Finding people by the start of their public first name (the people picker).
create index if not exists visitors_first_name_prefix_idx
  on visitors (lower(first_name) text_pattern_ops) where account_id is not null;
-- The people on a link, in the order the agent added them.
create index if not exists participants_share_order_idx
  on participants (share_id, invited_at, position);

-- "Jenny", "Jenny & Mike", "Jenny, Mike & Sam", "Jenny, Mike, Sam & 2 more";
-- "Jenny & 4 more" when that would be over 60 characters; '' with nobody.
-- First names only. lib/people-picker.ts peopleTitle() says it the same way.
create or replace function share_people_title(p_share uuid) returns text
language plpgsql stable as $$
declare
  names text[];
  n int;
  t text;
begin
  select array_agg(btrim(first_name) order by invited_at nulls last, position nulls last, created_at, first_name)
    into names
  from participants
  where share_id = p_share
    and btrim(first_name) <> ''
    and (invited_at is not null
      or not exists (select 1 from participants i where i.share_id = p_share and i.invited_at is not null));
  n := coalesce(array_length(names, 1), 0);
  if n = 0 then
    return '';
  elsif n = 1 then
    t := names[1];
  elsif n = 2 then
    t := names[1] || ' & ' || names[2];
  elsif n = 3 then
    t := names[1] || ', ' || names[2] || ' & ' || names[3];
  else
    t := names[1] || ', ' || names[2] || ', ' || names[3] || ' & ' || (n - 3) || ' more';
  end if;
  if char_length(t) > 60 then
    t := left(names[1], 40) || case when n > 1 then ' & ' || (n - 1) || ' more' else '' end;
  end if;
  return t;
end
$$;

-- Whenever someone is added, taken off or renamed, their link's name follows.
create or replace function participants_retitle() returns trigger
language plpgsql as $$
begin
  if tg_op <> 'DELETE' then
    update shares set client_name = share_people_title(new.share_id)
    where id = new.share_id and client_name is distinct from share_people_title(new.share_id);
  end if;
  if tg_op <> 'INSERT' and (tg_op = 'DELETE' or old.share_id is distinct from new.share_id) then
    update shares set client_name = share_people_title(old.share_id)
    where id = old.share_id and client_name is distinct from share_people_title(old.share_id);
  end if;
  return null;
end
$$;

drop trigger if exists participants_retitle on participants;
create trigger participants_retitle
after insert or delete or update of first_name, invited_at, position on participants
for each row execute function participants_retitle();

-- Backfill 1: a name typed on a link nobody is on yet (a quick Send that was
-- named, or a title the agent wrote) becomes the people it named, so nothing
-- on the dashboard goes blank: "Ben & Nina", "Ben, Nina and Sam" become Ben,
-- Nina (and Sam). At most 6, each at most 40 characters. A moment after the
-- link was made, so none of them is ever taken for the one person it was made
-- for (isPrivateTo). Tokens from md5, not pgcrypto, so any Postgres can run
-- it; 32 characters of hex fit isShareToken.
insert into participants (share_id, device_token, first_name, token, invited_at, position, added_from)
select x.share_id, 'invite:' || x.tok, x.name, x.tok, x.invited_at, x.ord, 'name'
from (
  select s.id as share_id,
    left(btrim(part.name), 40) as name,
    s.created_at + interval '1 microsecond' as invited_at,
    part.ord::smallint as ord,
    substr(
      md5(random()::text || clock_timestamp()::text || s.id::text || part.ord::text) || md5(random()::text),
      1, 32) as tok
  from shares s
  cross join lateral regexp_split_to_table(btrim(s.client_name), '\s*(?:,|&|\mand\M)\s*', 'i')
    with ordinality as part(name, ord)
  where btrim(s.client_name) <> ''
    and not exists (select 1 from participants p where p.share_id = s.id)
) x
where btrim(x.name) <> '' and x.ord <= 6;

-- Backfill 2: every link's name, from its people.
update shares set client_name = share_people_title(id);

-- Backfill 3: everyone already signed in on a link has been linked to its
-- agent (they follow each other, or one of them has since stopped).
update participants set linked_at = coalesce(linked_at, created_at) where account_id is not null;
