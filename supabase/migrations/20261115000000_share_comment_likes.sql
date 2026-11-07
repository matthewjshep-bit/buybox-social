-- An agent can heart something a client said on their link, and everyone on
-- the link sees "Liked by Jordan" under it. One heart per comment, since a
-- link has one agent. Only the link's agent can add or take one back (the
-- app's server checks), only on a client's comment, and it never leaves the
-- link: public pages, profiles and the admin never read it.
create table share_comment_likes (
  comment_id uuid primary key references comments (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table share_comment_likes enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on share_comment_likes from anon, authenticated;
  end if;
end
$$;
