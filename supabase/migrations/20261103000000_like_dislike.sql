-- Love / Maybe / Pass becomes Like / Dislike, each with optional specifics
-- (kitchen, yard, ...). Loves become likes and passes dislikes; maybes go away.
alter table reactions drop constraint reactions_reaction_check;
alter table reactions alter column reaction drop not null;
alter table reactions add column liked text[] not null default '{}';
alter table reactions add column disliked text[] not null default '{}';
update reactions set reaction = case reaction when 'love' then 'like' when 'pass' then 'dislike' end;
delete from reactions where reaction is null;
alter table reactions add constraint reactions_reaction_check check (reaction in ('like', 'dislike'));

alter table public_reactions drop constraint public_reactions_reaction_check;
alter table public_reactions alter column reaction drop not null;
alter table public_reactions add column liked text[] not null default '{}';
alter table public_reactions add column disliked text[] not null default '{}';
update public_reactions set reaction = case reaction when 'love' then 'like' when 'pass' then 'dislike' end;
delete from public_reactions where reaction is null;
alter table public_reactions add constraint public_reactions_reaction_check check (reaction in ('like', 'dislike'));
