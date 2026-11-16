-- Indexes for lookups the pages make on every load, which until now read a
-- whole table: a home's links, and one person's reactions, comments, opens
-- and places across links. Nothing else changes.

-- The links a home is on (a home's totals, and "sent to" in the feed).
create index if not exists share_listings_listing_idx on share_listings (listing_key);

-- What one person on a link reacted to (an agent's clients, a buyer's links).
create index if not exists reactions_participant_idx on reactions (participant_id);

-- What one person on a link said, newest first.
create index if not exists comments_participant_idx on comments (participant_id, created_at)
  where participant_id is not null;

-- When one person on a link opened it.
create index if not exists share_opens_participant_idx on share_opens (participant_id)
  where participant_id is not null;

-- The links an account is on (the header's menu, on every page).
create index if not exists participants_account_idx on participants (account_id)
  where account_id is not null;

-- What was asked for on a link.
create index if not exists share_asks_share_idx on share_asks (share_id);
