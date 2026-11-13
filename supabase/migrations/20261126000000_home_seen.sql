-- When someone last looked at their home page: what's "new" and where "You're all caught up" goes.
alter table visitors add column if not exists home_seen_at timestamptz;
-- Where "new" started for the visit under way: the home re-renders within a
-- visit (a reply, a comment), and its new-since line mustn't move until they
-- come back after a break.
alter table visitors add column if not exists home_seen_prev timestamptz;
