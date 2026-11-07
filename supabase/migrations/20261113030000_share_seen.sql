-- When the agent last looked at a link's page, so the dashboard can mark the
-- links that have something new from a client since. Links made before this
-- count as seen, so nothing old shows up as new.
alter table shares add column agent_seen_at timestamptz;
update shares set agent_seen_at = now();
