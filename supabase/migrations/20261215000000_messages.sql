-- Messages: a word in a conversation that isn't about one home, when each
-- send went, and when someone last looked at a conversation they were sent.

-- A plain message: a comment on the link itself, about no home.
alter table comments alter column listing_key drop not null;
-- (The composite key to share_listings is skipped when listing_key is null:
-- the share needs a key of its own, so a deleted link takes its messages with it.)
alter table comments add constraint comments_share_fk
  foreign key (share_id) references shares (id) on delete cascade;
-- A plain message is never a spot in a photo, an answer to someone's likes, or public.
alter table comments add constraint comments_plain_check
  check (listing_key is not null
         or (media_key is null and reply_to_participant is null and not shared_publicly));
create index comments_plain_idx on comments (share_id, created_at) where listing_key is null;

-- Homes added to a link later are their own message in the thread.
alter table share_listings add column added_at timestamptz not null default now();
update share_listings sl set added_at = s.created_at from shares s where s.id = sl.share_id;

-- When someone last looked at a conversation they were sent homes in (the
-- sender's side keeps shares.agent_seen_at). Keyed by the thread, as
-- Messages keys them: acct:<sender's account>, or link:<share> for a link
-- sent to several people.
create table thread_seen (
  account_id uuid not null references accounts (id) on delete cascade,
  thread_key text not null,
  seen_at timestamptz not null default now(),
  primary key (account_id, thread_key)
);
alter table thread_seen enable row level security;
-- Nothing already received reads as new on day one.
insert into thread_seen (account_id, thread_key)
select distinct p.account_id,
  case when (select count(*) from participants x where x.share_id = s.id) > 1
    then 'link:' || s.id else 'acct:' || s.agent_id end
from participants p join shares s on s.id = p.share_id
where p.account_id is not null and p.account_id <> s.agent_id
on conflict do nothing;
