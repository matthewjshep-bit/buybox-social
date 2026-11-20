-- When an agent's own listing was added (RESO OriginalEntryTimestamp), for
-- "Newest" on their page. New ones get it as they're made
-- (lib/own-listing-writes.ts); those already here take their last change,
-- the closest there is.
update listings
set data = data || jsonb_build_object('OriginalEntryTimestamp', to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
where owner_account_id is not null and not (data ? 'OriginalEntryTimestamp');
