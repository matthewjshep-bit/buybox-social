-- A post: something someone said about a home, started from their own page
-- (picking the home there) rather than on the home. It's a public comment on
-- the home like any other (its conversation, likes and replies), and their
-- page says they posted about it.
alter table public_comments add column posted boolean not null default false;
