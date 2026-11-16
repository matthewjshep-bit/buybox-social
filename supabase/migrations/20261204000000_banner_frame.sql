-- Moving and resizing your own banner image: the image as it was added (a
-- little smaller), kept so its framing can be changed later without adding it
-- again, and how it's framed in the band (which point of it sits at the
-- band's middle, and how large it is).
alter table accounts add column if not exists banner_source_data_url text
  check (banner_source_data_url is null or char_length(banner_source_data_url) <= 900000);
alter table accounts add column if not exists banner_frame jsonb;
