-- Buyers can now sign up too, so the table of signed-in people is renamed from
-- `agents` to `accounts`. `role` is null until someone finishes sign-up; every
-- existing profile so far belongs to an agent.
alter table agents rename to accounts;
alter table accounts add column role text check (role in ('agent', 'buyer'));
update accounts set role = 'agent' where full_name <> '';

-- A signed-in person's public reactions and comments follow their account
-- across devices rather than staying tied to one browser.
alter table visitors add column account_id uuid unique references accounts (id) on delete cascade;
