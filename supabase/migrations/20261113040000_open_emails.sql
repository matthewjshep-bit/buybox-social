-- The agent's email that a link was opened keeps its own 10-minute clock, so
-- it never holds back the email about what the client then likes or says.
alter table shares add column last_open_notified_at timestamptz;
