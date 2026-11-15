-- A few words about yourself at the top of your page, and, for an agent, a
-- few links that matter to them (their brokerage's site, their listings).
-- Each link: { "label": "Harbor & Pine", "url": "https://…" }, at most five,
-- http(s) only (checked by the app before it's saved).
alter table accounts add column if not exists bio text not null default ''
  check (char_length(bio) <= 300);
alter table accounts add column if not exists profile_links jsonb not null default '[]'
  check (jsonb_typeof(profile_links) = 'array' and jsonb_array_length(profile_links) <= 5);
