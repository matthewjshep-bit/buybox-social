-- An agent can take a home off a client's link without losing what the client
-- said about it: the row stays, flagged, and still feeds the client's profile.
alter table share_listings add column removed_at timestamptz;
