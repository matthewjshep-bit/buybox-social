-- A comment can be about one spot in one photo: tap the front door, say
-- something about it, and it shows right there. `spot` names it the way photo
-- likes do: a known thing ("Front door"), or where it is ("@42,61"). Both or
-- neither; replies take their comment's place.
alter table public_comments add column media_key text, add column spot text;
alter table public_comments add constraint public_comments_spot_check check ((media_key is null) = (spot is null));

alter table comments add column media_key text, add column spot text;
alter table comments add constraint comments_spot_check check ((media_key is null) = (spot is null));
