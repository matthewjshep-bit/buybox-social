-- Everyone on a package can have their own link: it opens as them, with no
-- name to type, and everything they like is theirs. The package's own link
-- still works, for anyone a client forwards it to.
alter table participants add column token text unique;
alter table participants add column invited_at timestamptz;
