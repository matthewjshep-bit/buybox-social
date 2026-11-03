-- Replies (one level deep) and likes on public comments, plus when each visitor
-- last opened their activity, so the bell can count what's new since then.
alter table public_comments add column parent_id uuid references public_comments (id) on delete cascade;
create index public_comments_parent_idx on public_comments (parent_id);

create table public_comment_likes (
  comment_id uuid not null references public_comments (id) on delete cascade,
  visitor_id uuid not null references visitors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, visitor_id)
);
create index public_comment_likes_visitor_idx on public_comment_likes (visitor_id);
alter table public_comment_likes enable row level security;

alter table visitors add column activity_seen_at timestamptz not null default now();
create index public_reactions_visitor_idx on public_reactions (visitor_id, updated_at);

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public_comment_likes from anon, authenticated;
  end if;
end
$$;
