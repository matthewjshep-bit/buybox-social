-- Where someone is: a city and its state ("Seattle", "WA"), said when they
-- join or on Edit profile. Shown by their name; their home feed leans toward
-- homes near it. Empty until they say.
alter table accounts add column if not exists location_city text not null default '';
alter table accounts add column if not exists location_state text not null default '';
