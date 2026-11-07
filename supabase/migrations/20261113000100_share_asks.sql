-- "Ask to see it" on an agent's link: when someone last asked to see a home in
-- person. Asking again the same day sends nothing new. Kept apart from the
-- comment the ask posts, so typing those same words as a comment doesn't count
-- as asking, and two taps at once still ask only once.
create table share_asks (
  participant_id uuid not null references participants (id) on delete cascade,
  listing_key text not null,
  share_id uuid not null,
  asked_at timestamptz not null default now(),
  primary key (participant_id, listing_key),
  foreign key (share_id, listing_key) references share_listings (share_id, listing_key) on delete cascade
);
alter table share_asks enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on share_asks from anon, authenticated;
  end if;
end
$$;
