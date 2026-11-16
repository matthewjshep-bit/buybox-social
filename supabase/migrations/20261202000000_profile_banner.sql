-- The band across the top of someone's profile, theirs to choose: one of the
-- drawn scenes, nothing at all ("blank"), or an image of their own (an
-- agent's branding). Empty: the scene picked for them, as before.
alter table accounts add column if not exists banner text not null default ''
  check (banner ~ '^(|blank|image|porch|hills|street|fence|scene[0-7])$');
-- Their own image: a small wide JPEG made in the browser, kept as a data URL.
alter table accounts add column if not exists banner_data_url text
  check (banner_data_url is null or char_length(banner_data_url) <= 600000);
