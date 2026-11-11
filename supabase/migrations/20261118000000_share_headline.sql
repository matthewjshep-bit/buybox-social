-- The headline of an agent's link, on the welcome screen it opens on, in the
-- agent's own words. Empty: the standard line ("Dana, I picked this home for
-- you"), worked out from who it's for and how many homes are on it.
alter table shares add column headline text not null default '' check (char_length(headline) <= 90);
