-- Supabase's public API keys act as the `anon` and `authenticated` roles. RLS
-- already hides every row from them; this removes their table access too, so a
-- policy added by mistake later can't open anything up. No-op without Supabase.
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all sequences in schema public from anon, authenticated;
    revoke all on all functions in schema public from anon, authenticated;
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke all on sequences from anon, authenticated;
    alter default privileges in schema public revoke all on functions from anon, authenticated;
  end if;
end
$$;
