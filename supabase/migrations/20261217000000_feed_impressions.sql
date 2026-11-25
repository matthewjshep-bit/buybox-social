-- What each person has had in front of them in their feed (a card at least
-- half on screen for a moment): so the next visit leads with what they
-- haven't seen, and what they have falls back unless something new happened
-- on it. `item` is "home:<listing key>" or "post:<post id>".
create table feed_impressions (
  visitor_id uuid not null references visitors (id) on delete cascade,
  item text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count int not null default 1,
  primary key (visitor_id, item)
);
create index feed_impressions_recent_idx on feed_impressions (visitor_id, last_seen_at desc);
alter table feed_impressions enable row level security;
