import { accountFor, nameFromSignUp, type Account } from "./auth";
import { sql } from "./db";
import { readDevice } from "./engagement";
import { ensureAccountVisitor } from "./public";
import { ensureLinkProfile, linkOnce } from "./shares";

// What happens once someone has proved an email is theirs, whichever way
// they did it: the code typed on the page (app/login/actions.ts verifyCode),
// the emailed link (app/auth/callback/route.ts), or the test password. Their
// account (made the first time), and what this browser did before becomes
// its. Server only.

export type SignedIn = {
  account: Account;
  // Their name as it is now ("" until they've said it).
  fullName: string;
  agent: boolean;
  // A buyer's account with no first name yet, to ask for.
  needsName: boolean;
  // New here (they haven't said what they are yet): /welcome.
  welcome: boolean;
};

// `asAgent`: an agent's account. `chosen`: they said so themselves, with the
// code (or the password) in hand on the "For agents" form, so an account
// already there becomes an agent's too. Not chosen (the emailed link, which
// only knows what this email asked for in the last half hour: lib/auth.ts
// claimAgentIntent): only a brand-new account is an agent's. One already
// there stays what it is, whatever anyone typed since.
export async function afterSignIn(
  user: { id: string; email: string },
  { asAgent, chosen }: { asAgent: boolean; chosen: boolean },
): Promise<SignedIn> {
  let account = await accountFor(user, asAgent ? "agent" : "buyer");
  if (asAgent && chosen && account.role !== "agent") {
    // (Shopping until now: which kind of pro is asked next, at /welcome.)
    await sql`update accounts set role = 'agent', kind = null where id = ${account.id}`;
    account = { ...account, role: "agent", kind: null };
  }
  // Settled here, so what was noted for the email's link is done with.
  await sql`delete from account_intents where email = ${user.email}`;
  // A name from the form, for an account that has none yet.
  const fullName = await nameFromSignUp(account);
  // A place on an agent's link this browser had becomes theirs: they and the
  // agent follow each other, the first time they're linked. Any link they're
  // on: a profile, if they had none, so the agent's pages can link their name to it.
  for (const participantId of await claimDevice(account.id)) await linkOnce(account.id, participantId);
  await ensureLinkProfile(account.id);
  // Anyone with a name has a public page from here on, so they can be found
  // and followed (Search, People) before they've liked anything. (After the
  // browser's own page has become theirs, above; the name as it is now.)
  if (account.role && fullName.trim()) await ensureAccountVisitor({ ...account, full_name: fullName });
  const agent = account.role === "agent";
  return { account, fullName, agent, needsName: !agent && !fullName.trim(), welcome: !account.kind };
}

// On signing in: what this browser did before becomes the account's. Its
// public self (when the account has none yet), and its place on any agent's
// link where the account has none yet. Returns those places.
async function claimDevice(accountId: string): Promise<string[]> {
  const device = await readDevice();
  if (!device) return [];
  await sql`
    update visitors set account_id = ${accountId}
    where device_token = ${device} and account_id is null
      and not exists (select 1 from visitors where account_id = ${accountId})`;
  const claimed = await sql<{ id: string }[]>`
    update participants p set account_id = ${accountId}
    where p.device_token = ${device} and p.account_id is null
      and not exists (select 1 from participants q where q.share_id = p.share_id and q.account_id = ${accountId})
    returning p.id`;
  return claimed.map((row) => row.id);
}
