-- How many taste descriptions the model has been asked to write each day,
-- whatever came of each, so however many people look it never writes more
-- than the day's cap.
create table taste_generations (
  day date primary key,
  calls int not null default 0
);
alter table taste_generations enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on taste_generations from anon, authenticated;
  end if;
end
$$;
