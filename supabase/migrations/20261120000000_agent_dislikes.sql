-- An agent's first pass says what they don't like too, as anyone on the link
-- can ("Jordan didn't like the price"). Still one mark per thing per link: a
-- like or a dislike, each replacing the other. Everything already there is a
-- like. (The table keeps its name; it's never read outside the link.)
alter table share_agent_likes add column reaction text not null default 'like'
  check (reaction in ('like', 'dislike'));
