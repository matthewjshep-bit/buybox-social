-- Someone on an agent's link is now someone with an account: liking or saying
-- anything there asks them to sign up (or in) first, right on the link. Their
-- place on each link is tied to their account, so it's them on every device.
-- Before this, a link knew people by a first name and a browser; on signing
-- in, a browser's place on a link (or a personal link's person) becomes theirs.
alter table participants add column account_id uuid references accounts (id) on delete set null;
create unique index participants_share_account_idx on participants (share_id, account_id) where account_id is not null;
