-- A comment taken back by the person who said it, with replies under it, is
-- kept as "Comment deleted" so the replies keep their place: its words are
-- cleared and it's marked deleted_at. Without replies it's deleted outright,
-- as before (lib/own-words.ts).
--
-- Every read leaves a deleted comment out without having to say so: the
-- tables are renamed *_all, and public_comments and comments become views of
-- the rows not deleted. (Simple views: inserts, updates and deletes through
-- them work as on the table. security_invoker, so the tables' row level
-- security still holds for Supabase's public keys.) Only the thread, which
-- draws the placeholder, and a reply's check for the comment it answers,
-- look past it.
--
-- NB for later migrations: change the *_all tables, then recreate the view
-- (a view keeps the columns it had when it was made).

alter table public_comments add column deleted_at timestamptz;
alter table comments add column deleted_at timestamptz;

-- Its words go with it.
alter table public_comments drop constraint public_comments_body_check;
alter table public_comments add constraint public_comments_body_check
  check (deleted_at is not null or char_length(body) between 1 and 1000);
alter table comments drop constraint comments_body_check;
alter table comments add constraint comments_body_check
  check (deleted_at is not null or char_length(body) between 1 and 1000);

alter table public_comments rename to public_comments_all;
alter table comments rename to comments_all;

create view public_comments with (security_invoker = true) as
  select * from public_comments_all where deleted_at is null;
create view comments with (security_invoker = true) as
  select * from comments_all where deleted_at is null;

-- Once the last reply under a deleted comment goes, so does it.
create function drop_emptied_comment() returns trigger language plpgsql as $$
begin
  if old.parent_id is not null then
    execute format(
      'delete from %I p where p.id = $1 and p.deleted_at is not null
         and not exists (select 1 from %I r where r.parent_id = $1)',
      tg_table_name, tg_table_name)
    using old.parent_id;
  end if;
  return null;
end $$;

create trigger public_comments_drop_emptied after delete on public_comments_all
  for each row execute function drop_emptied_comment();
create trigger comments_drop_emptied after delete on comments_all
  for each row execute function drop_emptied_comment();
