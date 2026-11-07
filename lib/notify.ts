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
export async function notifyAgent(
  shareId: string,
  summary: string,
  { now = false, open = false }: { now?: boolean; open?: boolean } = {},
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
    const link = `${appUrl()}/dashboard/shares/${shareId}`;
    await sendEmail(row.email, summary, `${summary}\n\nSee all the activity: ${link}`);
  } catch (error) {
    console.error("[email] failed to notify agent", error);
  }
}
