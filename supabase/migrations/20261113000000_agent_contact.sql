-- How clients reach an agent from a link: a phone to text or call, and an
-- email, each only if the agent chooses to show it. Separate from the login
-- email and the sign-up phone, so nothing shows on a link until they type it.
alter table accounts
  add column contact_phone text not null default '',
  add column contact_email text not null default '';
