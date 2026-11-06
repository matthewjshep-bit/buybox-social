-- A few words about someone's taste on their page, written from their public
-- likes, passes and comments. Kept until what it was written from changes, so
-- a page never waits for it to be written again.
create table taste_summaries (
  visitor_id uuid primary key references visitors (id) on delete cascade,
  -- What it was written from: the person's public taste, the prompt and the model.
  input_hash text not null,
  summary jsonb not null,
  source text not null check (source in ('ai', 'template')),
  model text,
  created_at timestamptz not null default now(),
  -- The last time someone started writing it, so one does at a time.
  attempted_at timestamptz
);
alter table taste_summaries enable row level security;

-- What someone keeps off their page: what they pass on, and any of the
-- things their taste says they like or pass on.
alter table visitors
  add column hide_passes boolean not null default false,
  add column taste_hidden jsonb not null default '[]';

-- Someone's page reads their comments newest first.
create index public_comments_visitor_idx on public_comments (visitor_id, created_at);

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on taste_summaries from anon, authenticated;
  end if;
end
$$;
