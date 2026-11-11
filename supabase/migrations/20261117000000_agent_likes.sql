-- An agent's first pass on their own link: the things they like about each
-- home, a fact ("Price") or a spot in a photo, which everyone on the link sees
-- as theirs ("Jordan liked the kitchen"). Their notes are comments, as their
-- replies always were. A link has one agent, so one like per thing per link.
-- Only the link's agent can add or take one back (the app's server checks),
-- and it never leaves the link: public pages, profiles and the admin never
-- read it, and it never counts among the clients' own likes.
create table share_agent_likes (
  share_id uuid not null,
  listing_key text not null,
  media_key text not null,
  tag text not null check (char_length(tag) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (share_id, listing_key, media_key, tag),
  foreign key (share_id, listing_key) references share_listings (share_id, listing_key) on delete cascade
);
alter table share_agent_likes enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on share_agent_likes from anon, authenticated;
  end if;
end
$$;
