-- A client with an account and the agent whose link they're on follow each
-- other. From now on that's done once, as they join it (joinedLink,
-- lib/shares.ts); this does it for everyone already on one.

-- Each such agent's profile, under their own first name, if they had none.
insert into visitors (device_token, first_name, account_id)
select 'account:' || a.id, split_part(regexp_replace(btrim(a.full_name), '[[:space:]]+', ' ', 'g'), ' ', 1), a.id
from accounts a
where exists (
    select 1 from shares s join participants p on p.share_id = s.id
    where s.agent_id = a.id and p.account_id is not null and p.account_id <> a.id)
  and not exists (select 1 from visitors v where v.account_id = a.id)
on conflict do nothing;

-- Both ways.
insert into follows (follower_id, followed_id)
select distinct pair.follower, pair.followed
from participants p
join shares s on s.id = p.share_id
join visitors client on client.account_id = p.account_id
join visitors agent on agent.account_id = s.agent_id
cross join lateral (values (client.id, agent.id), (agent.id, client.id)) as pair (follower, followed)
where p.account_id is not null and p.account_id <> s.agent_id
on conflict do nothing;
