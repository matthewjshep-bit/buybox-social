-- What someone on Porchcard is, as they said when they joined: an agent, an
-- investor, a lender, or someone shopping for a home ('buyer'). Agents,
-- investors and lenders have the same tools (role 'agent'); the word for the
-- homes they put up is theirs ("Listings", or an investor's "Deals"), and so
-- is the chip beside their name. Null until they've said (a new account, or
-- one made joining an agent's link): until then it goes by their role.
alter table accounts add column if not exists kind text
  check (kind in ('agent', 'investor', 'lender', 'buyer'));

update accounts set kind = case role when 'agent' then 'agent' when 'buyer' then 'buyer' end
where kind is null and role is not null;
