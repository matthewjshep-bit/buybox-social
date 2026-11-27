-- Your own words, changed after they were said: when, so they read "Edited".
-- (Taking them back deletes the row, as before.)
alter table public_comments add column if not exists edited_at timestamptz;
alter table comments add column if not exists edited_at timestamptz;
alter table posts add column if not exists edited_at timestamptz;
