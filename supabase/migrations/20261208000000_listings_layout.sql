-- How an agent's listings are laid out on their profile (one featured with
-- the rest under it, a grid of two or three across, or a plain list), and
-- which listing leads.
alter table accounts add column if not exists listings_layout text not null default 'featured'
  check (listings_layout in ('featured', 'grid2', 'grid3', 'list'));
alter table accounts add column if not exists featured_listing_key text;
