-- The admin pages link to each person by id, so a lead who hasn't finished
-- signing up needs one of their own (an email never goes in a link).
alter table signups add column id uuid not null default gen_random_uuid() unique;
