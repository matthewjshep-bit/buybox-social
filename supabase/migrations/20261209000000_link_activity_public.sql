-- What someone does on an agent's link (likes, passes, what they say about a
-- home) shows on their own public profile, from here on, unless they'd rather
-- it didn't.
--   hide_links        they've switched it off: nothing from links shows.
--   links_shown_from  only what they did on links at or after this shows.
--                     For everyone already here, that's the moment this is
--                     applied: what they did while a link said "only you and
--                     your agent see this" stays private. For someone new,
--                     it's when their profile began. Switching it back on
--                     after having it off starts again from then.
alter table visitors add column if not exists hide_links boolean not null default false;
alter table visitors add column if not exists links_shown_from timestamptz not null default now();
