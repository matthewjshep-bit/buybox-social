import { sql } from "./db";
import { appUrl } from "./format";

// Plain text only: names and comments come from anyone holding a share link.
async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] to=${to} subject=${JSON.stringify(subject)}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
  });
  if (!res.ok) console.error(`[email] Resend returned ${res.status}`);
}

// At most one email per share every 10 minutes, so a busy thread can't flood the
// agent's inbox. The dashboard always has the full activity. Something the agent
// should act on straight away (a client asking to see a home) goes out `now`,
// and still counts as the latest email. A link being opened (`open`) keeps its
// own 10 minutes, so it never holds back the email about what the client does next.
// `anchor`: where on the link's page it happened ("comment-<id>", "home-<key>"),
// so the email's link opens on the homes, at that comment or home.
export async function notifyAgent(
  shareId: string,
  summary: string,
  { now = false, open = false, anchor }: { now?: boolean; open?: boolean; anchor?: string } = {},
) {
  try {
    const [row] = open
      ? await sql<{ email: string }[]>`
          update shares s set last_open_notified_at = now()
          from accounts a
          where s.id = ${shareId} and a.id = s.agent_id
            and (s.last_open_notified_at is null or s.last_open_notified_at < now() - interval '10 minutes')
          returning a.email`
      : await sql<{ email: string }[]>`
          update shares s set last_notified_at = now()
          from accounts a
          where s.id = ${shareId} and a.id = s.agent_id
            and (${now} or s.last_notified_at is null or s.last_notified_at < now() - interval '10 minutes')
          returning a.email`;
    if (!row) return;
    const link = `${appUrl()}/dashboard/shares/${shareId}${anchor ? `?tab=homes#${encodeURIComponent(anchor)}` : ""}`;
    await sendEmail(row.email, summary, `${summary}\n\nSee all the activity: ${link}`);
  } catch (error) {
    console.error("[email] failed to notify agent", error);
  }
}

// An agent added someone on Porchcard to a link: they hear it from us, with
// their own link, since nobody may have texted it to them. Once a day at most
// for each agent and client, however many links or people are added (claimed
// in the same statement that checks, so two at once send one). The day is kept
// in agent_reach, not on the person's place on the link, so taking them off
// and adding them again (or their leaving) can't send another. Only ever for
// someone signed up, at the email on their account, which the agent never sees.
export async function notifyClientAdded(participantId: string) {
  try {
    const [row] = await sql<{ email: string; agent_name: string; token: string; homes: number }[]>`
      with person as (
        select p.id, p.account_id, p.token, s.id as share_id, s.agent_id, a.email, ag.full_name as agent_name
        from participants p
          join shares s on s.id = p.share_id
          join accounts a on a.id = p.account_id
          join accounts ag on ag.id = s.agent_id
        where p.id = ${participantId} and p.notified_at is null and p.token is not null and a.role is not null
      ), claimed as (
        insert into agent_reach (agent_id, account_id, notified_at)
        select agent_id, account_id, now() from person
        on conflict (agent_id, account_id) do update set notified_at = excluded.notified_at
        where agent_reach.notified_at is null or agent_reach.notified_at < now() - interval '24 hours'
        returning agent_id
      ), marked as (
        update participants set notified_at = now()
        where id = (select id from person) and exists (select 1 from claimed)
      )
      select person.email, person.agent_name, person.token,
        (select count(*)::int from share_listings sl where sl.share_id = person.share_id and sl.removed_at is null) as homes
      from person
      where exists (select 1 from claimed)`;
    if (!row) return;
    const who = row.agent_name.trim() || "Your agent";
    const what = row.homes === 1 ? "1 home" : `${row.homes} homes`;
    const subject = `${who} sent you ${what} on Porchcard`;
    await sendEmail(
      row.email,
      subject,
      `${subject}.\n\nSee ${row.homes === 1 ? "it" : "them"} here: ${appUrl()}/s/${row.token}\n\n` +
        "Not expecting this? Open the link and choose Leave this link.",
    );
  } catch (error) {
    console.error("[email] failed to tell a client about their link", error);
  }
}
