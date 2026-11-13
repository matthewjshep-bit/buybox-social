-- Someone on an agent's link who has signed up is their account there, and has
-- a profile, so the agent's pages can link to it. From now on that's done as
-- they join a link or sign in on one (ensureLinkProfile); this does it for everyone before.

-- A browser's place on a link from before it was tied to an account becomes
-- the account's that browser signed in as: one place per link per account.
with places as (
  select distinct on (p.share_id, v.account_id) p.id, v.account_id
  from participants p
  join visitors v on v.device_token = p.device_token
  where v.account_id is not null and p.account_id is null
    and not exists (select 1 from participants q where q.share_id = p.share_id and q.account_id = v.account_id)
  order by p.share_id, v.account_id, p.created_at
)
update participants p set account_id = places.account_id
from places
where p.id = places.id;

-- A profile for everyone on a link with an account and none yet, under the
-- first name on their account, or else the one they have on a link
-- (ensureLinkProfile, lib/shares.ts).
insert into visitors (device_token, first_name, account_id)
select 'account:' || a.id,
  coalesce(
    nullif(split_part(regexp_replace(btrim(a.full_name), '[[:space:]]+', ' ', 'g'), ' ', 1), ''),
    (select p.first_name from participants p where p.account_id = a.id order by p.created_at limit 1),
    ''),
  a.id
from accounts a
where exists (select 1 from participants p where p.account_id = a.id)
  and not exists (select 1 from visitors v where v.account_id = a.id)
on conflict do nothing;
